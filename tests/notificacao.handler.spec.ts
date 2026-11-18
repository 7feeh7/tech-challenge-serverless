import { SQSEvent } from 'aws-lambda';
import { handler } from '../src/functions/notificacao/handler';
import { resetDedupeCache } from '../src/shared/services/dedupe.service';
import { obterSecret } from '../src/shared/services/secrets.service';

const mockSend = jest.fn();

jest.mock('../src/shared/services/secrets.service', () => ({
  obterSecret: jest.fn(),
}));

jest.mock('../src/shared/adapters/sendgrid.adapter', () => ({
  SendGridEmailSender: jest.fn().mockImplementation(() => ({
    send: (...args: unknown[]) => mockSend(...args),
  })),
}));

const eventoLegado = {
  version: 1,
  eventId: 'evt-1',
  eventType: 'ordem-servico.status-changed.v1',
  occurredAt: '2026-09-13T12:00:00.000Z',
  correlationId: 'corr-1',
  ordemServicoId: 'uuid-os1',
  numeroOS: 42,
  statusAnterior: 'RECEBIDA',
  statusNovo: 'EM_DIAGNOSTICO',
  destinatario: { nome: 'João', email: 'joao@email.com' },
};

const criarEventoSqs = (
  registros: { messageId: string; body: string }[],
): SQSEvent => ({ Records: registros as unknown as SQSEvent['Records'] });

const logsDeErro = (spy: jest.SpyInstance): Record<string, unknown>[] =>
  spy.mock.calls.map(
    ([linha]) => JSON.parse(String(linha)) as Record<string, unknown>,
  );

describe('handler da notificacao', () => {
  beforeAll(() => {
    process.env.SENDGRID_SECRET_ARN = 'arn:aws:secretsmanager:teste';
    process.env.SENDGRID_FROM_EMAIL = 'oficina@oficina.com';
    (obterSecret as jest.Mock).mockResolvedValue(
      JSON.stringify({ apiKey: 'chave-de-teste' }),
    );
  });

  beforeEach(() => {
    resetDedupeCache();
    mockSend.mockResolvedValue(undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('não reporta falha quando todos os itens são processados', async () => {
    const resultado = await handler(
      criarEventoSqs([{ messageId: 'm-1', body: JSON.stringify(eventoLegado) }]),
    );

    expect(resultado).toEqual({ batchItemFailures: [] });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('reporta o item com erro permanente como falha, para ir à DLQ', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const resultado = await handler(
      criarEventoSqs([
        {
          messageId: 'm-invalido',
          body: JSON.stringify({ ...eventoLegado, eventType: 'desconhecido' }),
        },
      ]),
    );

    expect(resultado).toEqual({
      batchItemFailures: [{ itemIdentifier: 'm-invalido' }],
    });
    expect(mockSend).not.toHaveBeenCalled();
    expect(logsDeErro(errorSpy)).toEqual([
      expect.objectContaining({
        evento: 'notificacao_status_permanente',
        messageId: 'm-invalido',
        correlationId: 'corr-1',
      }),
    ]);
  });

  it('reporta o item com falha transiente e registra o correlationId', async () => {
    mockSend.mockRejectedValue(new Error('SendGrid 503'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const resultado = await handler(
      criarEventoSqs([
        { messageId: 'm-retry', body: JSON.stringify(eventoLegado) },
      ]),
    );

    expect(resultado).toEqual({
      batchItemFailures: [{ itemIdentifier: 'm-retry' }],
    });
    expect(logsDeErro(errorSpy)).toEqual([
      expect.objectContaining({
        evento: 'notificacao_status_retry',
        messageId: 'm-retry',
        correlationId: 'corr-1',
      }),
    ]);
  });

  it('reporta só os itens com falha e processa os demais do lote', async () => {
    jest.spyOn(console, 'error').mockImplementation();

    const resultado = await handler(
      criarEventoSqs([
        { messageId: 'm-ok', body: JSON.stringify(eventoLegado) },
        { messageId: 'm-ruim', body: 'não é json' },
      ]),
    );

    expect(resultado).toEqual({
      batchItemFailures: [{ itemIdentifier: 'm-ruim' }],
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('mascara o e-mail no motivo da falha registrado no log', async () => {
    mockSend.mockRejectedValue(new Error('SendGrid recusou joao@email.com'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    await handler(
      criarEventoSqs([
        { messageId: 'm-pii', body: JSON.stringify(eventoLegado) },
      ]),
    );

    const [log] = logsDeErro(errorSpy);
    expect(log.erro).toBe('SendGrid recusou jo***@email.com');
  });

  describe('configuração', () => {
    // O handler guarda o serviço em cache; reiniciar o registro de módulos
    // reinicia esse cache e também as instâncias dos mocks, por isso o
    // handler e os mocks são lidos juntos.
    const carregarModulosReiniciados = async () => {
      jest.resetModules();

      return {
        handler: (await import('../src/functions/notificacao/handler'))
          .handler,
        SendGridEmailSender: (
          await import('../src/shared/adapters/sendgrid.adapter')
        ).SendGridEmailSender as unknown as jest.Mock,
        obterSecret: (await import('../src/shared/services/secrets.service'))
          .obterSecret as jest.Mock,
      };
    };

    const configuracaoOriginal = {
      secretArn: process.env.SENDGRID_SECRET_ARN,
      fromEmail: process.env.SENDGRID_FROM_EMAIL,
    };

    afterEach(() => {
      process.env.SENDGRID_SECRET_ARN = configuracaoOriginal.secretArn;
      process.env.SENDGRID_FROM_EMAIL = configuracaoOriginal.fromEmail;
    });

    it.each(['SENDGRID_SECRET_ARN', 'SENDGRID_FROM_EMAIL'])(
      'falha o lote inteiro quando %s não está configurada',
      async (variavel) => {
        delete process.env[variavel];

        await expect(
          (await carregarModulosReiniciados()).handler(criarEventoSqs([])),
        ).rejects.toThrow('não configurados');
      },
    );

    it('usa a apiKey do segredo em JSON', async () => {
      const modulos = await carregarModulosReiniciados();
      modulos.obterSecret.mockResolvedValue(
        JSON.stringify({ apiKey: 'chave-do-json' }),
      );

      await modulos.handler(criarEventoSqs([]));

      expect(modulos.SendGridEmailSender).toHaveBeenCalledWith('chave-do-json');
    });

    it('usa o segredo inteiro como chave quando o JSON não tem apiKey', async () => {
      const segredo = JSON.stringify({ outraChave: 'valor' });
      const modulos = await carregarModulosReiniciados();
      modulos.obterSecret.mockResolvedValue(segredo);

      await modulos.handler(criarEventoSqs([]));

      expect(modulos.SendGridEmailSender).toHaveBeenCalledWith(segredo);
    });
  });
});

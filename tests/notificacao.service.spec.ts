import {
  NotificacaoService,
  PermanentNotificationError,
  TransientNotificationError,
} from '../src/functions/notificacao/notificacao.service';
import * as notificacaoEvent from '../src/shared/types/notificacao.event';
import { EmailSender } from '../src/shared/adapters/sendgrid.adapter';
import { resetDedupeCache } from '../src/shared/services/dedupe.service';
import { PAGAMENTO_DISPONIVEL_EVENT_TYPE } from '../src/shared/types/pagamento-disponivel.event';
import {
  STATUS_CHANGED_EVENT_TYPE,
  STATUS_CHANGED_EVENT_VERSION,
  StatusOS,
} from '../src/shared/types/status-changed.event';

const evento = {
  version: STATUS_CHANGED_EVENT_VERSION,
  eventId: 'evt-1',
  eventType: STATUS_CHANGED_EVENT_TYPE,
  occurredAt: '2026-09-13T12:00:00.000Z',
  correlationId: 'corr-1',
  ordemServicoId: 'uuid-os1',
  numeroOS: 42,
  statusAnterior: StatusOS.RECEBIDA,
  statusNovo: StatusOS.EM_DIAGNOSTICO,
  destinatario: { nome: 'João', email: 'joao@email.com' },
};

const envelopeStatusChanged = {
  eventId: 'evt-env-1',
  eventType: STATUS_CHANGED_EVENT_TYPE,
  version: 1,
  occurredAt: '2026-11-15T10:05:00.000Z',
  source: 'os-service',
  correlationId: 'corr-env-1',
  causationId: null,
  ordemServicoId: 'uuid-os2',
  rodada: 1,
  payload: {
    numeroOS: 1042,
    statusAnterior: StatusOS.AGUARDANDO_PAGAMENTO,
    statusNovo: StatusOS.AGUARDANDO_EXECUCAO,
    destinatario: { nome: 'Maria', email: 'maria@email.com' },
  },
};

const envelopePagamentoDisponivel = {
  eventId: 'evt-pag-1',
  eventType: PAGAMENTO_DISPONIVEL_EVENT_TYPE,
  version: 1,
  occurredAt: '2026-11-15T10:06:30.000Z',
  source: 'os-service',
  correlationId: 'corr-pag-1',
  causationId: 'evt-cobranca-1',
  ordemServicoId: 'uuid-os3',
  rodada: 1,
  payload: {
    destinatario: { nome: 'Carlos', email: 'carlos@email.com' },
    numeroOs: 1042,
    linkPagamento: 'https://www.mercadopago.com.br/checkout/pagar/123',
    prazoPagamento: '2026-11-15T10:18:00.000Z',
    valorCentavos: 34500,
  },
};

const criarBodySns = (mensagem: unknown, correlationId?: string): string =>
  JSON.stringify({
    Type: 'Notification',
    Message: JSON.stringify(mensagem),
    ...(correlationId
      ? {
          MessageAttributes: {
            correlationId: { Type: 'String', Value: correlationId },
          },
        }
      : {}),
  });

const logsDeNotificacao = (spy: jest.SpyInstance): Record<string, unknown>[] =>
  spy.mock.calls
    .map(([linha]) => JSON.parse(String(linha)) as Record<string, unknown>)
    .filter((log) => log.evento === 'notificacao_status');

const criarSenderMock = (): jest.Mocked<EmailSender> => ({
  send: jest.fn().mockResolvedValue(undefined),
});

describe('NotificacaoService', () => {
  beforeEach(() => {
    resetDedupeCache();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends email for a valid SNS-wrapped event', async () => {
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');
    const body = JSON.stringify({
      Type: 'Notification',
      Message: JSON.stringify(evento),
    });

    await service.processRecord(body);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'joao@email.com',
        from: 'oficina@oficina.com',
        subject: 'OS #42: Em diagnóstico',
      }),
    );
  });

  it('deduplicates events by eventId on redelivery', async () => {
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');
    const body = JSON.stringify(evento);

    await service.processRecord(body);
    await service.processRecord(body);

    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('classifies invalid payload as permanent failure', async () => {
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');

    await expect(
      service.processRecord(JSON.stringify({ version: 2 })),
    ).rejects.toThrow(PermanentNotificationError);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('retries transient SendGrid failures', async () => {
    const sender = criarSenderMock();
    sender.send.mockRejectedValue(new Error('SendGrid 503'));
    const service = new NotificacaoService(sender, 'oficina@oficina.com');

    await expect(
      service.processRecord(JSON.stringify(evento)),
    ).rejects.toThrow(TransientNotificationError);
  });

  it('trata como transiente uma rejeição do provedor que não é Error', async () => {
    const sender = criarSenderMock();
    sender.send.mockRejectedValue('timeout');
    const service = new NotificacaoService(sender, 'oficina@oficina.com');

    await expect(
      service.processRecord(JSON.stringify(evento)),
    ).rejects.toThrow(new TransientNotificationError('timeout'));
  });

  describe('formato antigo de status alterado (regressão)', () => {
    it('envia o e-mail de um evento no formato antigo, direto no corpo da fila', async () => {
      const sender = criarSenderMock();
      const service = new NotificacaoService(sender, 'oficina@oficina.com');

      await service.processRecord(JSON.stringify(evento));

      expect(sender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'joao@email.com',
          subject: 'OS #42: Em diagnóstico',
        }),
      );
    });

    it('envia o e-mail de um evento no formato antigo embrulhado pelo SNS', async () => {
      const sender = criarSenderMock();
      const service = new NotificacaoService(sender, 'oficina@oficina.com');

      await service.processRecord(criarBodySns(evento));

      expect(sender.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('status alterado no envelope da Fase 4', () => {
    it('envia o e-mail com status novo da Fase 4', async () => {
      const sender = criarSenderMock();
      const service = new NotificacaoService(sender, 'oficina@oficina.com');

      await service.processRecord(criarBodySns(envelopeStatusChanged));

      expect(sender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'maria@email.com',
          subject: 'OS #1042: Aguardando execução',
        }),
      );
    });

    it('rejeita status desconhecido como falha permanente', async () => {
      const sender = criarSenderMock();
      const service = new NotificacaoService(sender, 'oficina@oficina.com');
      const mensagem = {
        ...envelopeStatusChanged,
        payload: { ...envelopeStatusChanged.payload, statusNovo: 'ARQUIVADA' },
      };

      await expect(
        service.processRecord(criarBodySns(mensagem)),
      ).rejects.toThrow(PermanentNotificationError);
      expect(sender.send).not.toHaveBeenCalled();
    });

    it('rejeita payload que não é objeto como falha permanente', async () => {
      const service = new NotificacaoService(
        criarSenderMock(),
        'oficina@oficina.com',
      );
      const mensagem = { ...envelopeStatusChanged, payload: 'texto' };

      await expect(
        service.processRecord(criarBodySns(mensagem)),
      ).rejects.toThrow(PermanentNotificationError);
    });
  });

  describe('pagamento disponível', () => {
    it('envia o e-mail com o link de pagamento', async () => {
      const sender = criarSenderMock();
      const service = new NotificacaoService(sender, 'oficina@oficina.com');

      await service.processRecord(criarBodySns(envelopePagamentoDisponivel));

      expect(sender.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'carlos@email.com',
          from: 'oficina@oficina.com',
          subject: 'OS #1042: pagamento disponível',
          text: expect.stringContaining(
            'https://www.mercadopago.com.br/checkout/pagar/123',
          ),
        }),
      );
    });

    it('deduplica o evento reentregue pelo eventId', async () => {
      const sender = criarSenderMock();
      const service = new NotificacaoService(sender, 'oficina@oficina.com');
      const body = criarBodySns(envelopePagamentoDisponivel);

      await service.processRecord(body);
      await service.processRecord(body);

      expect(sender.send).toHaveBeenCalledTimes(1);
    });

    it('rejeita payload incompleto como falha permanente', async () => {
      const sender = criarSenderMock();
      const service = new NotificacaoService(sender, 'oficina@oficina.com');
      const payloadSemLink: Record<string, unknown> = {
        ...envelopePagamentoDisponivel.payload,
      };
      delete payloadSemLink.linkPagamento;
      const mensagem = {
        ...envelopePagamentoDisponivel,
        payload: payloadSemLink,
      };

      await expect(
        service.processRecord(criarBodySns(mensagem)),
      ).rejects.toThrow(PermanentNotificationError);
      expect(sender.send).not.toHaveBeenCalled();
    });

    it('repete a tentativa quando o provedor de e-mail falha', async () => {
      const sender = criarSenderMock();
      sender.send.mockRejectedValue(new Error('SendGrid 503'));
      const service = new NotificacaoService(sender, 'oficina@oficina.com');

      await expect(
        service.processRecord(criarBodySns(envelopePagamentoDisponivel)),
      ).rejects.toThrow(TransientNotificationError);
    });
  });

  describe('falhas permanentes', () => {
    it.each([
      [
        'eventType desconhecido',
        JSON.stringify({ ...evento, eventType: 'ordem-servico.outro.v1' }),
      ],
      ['eventType ausente', JSON.stringify({ version: 1, eventId: 'evt-9' })],
      ['corpo que não é JSON', 'não é json'],
      [
        'mensagem SNS com JSON inválido',
        JSON.stringify({ Message: '{quebrado' }),
      ],
      ['corpo nulo', 'null'],
      ['versão não suportada', JSON.stringify({ ...evento, version: 2 })],
    ])(
      'reporta %s como falha permanente, sem enviar e-mail',
      async (_caso, body) => {
        const sender = criarSenderMock();
        const service = new NotificacaoService(sender, 'oficina@oficina.com');

        await expect(service.processRecord(body)).rejects.toThrow(
          PermanentNotificationError,
        );
        expect(sender.send).not.toHaveBeenCalled();
      },
    );
  });

  it('não classifica como permanente um erro inesperado ao ler o evento', async () => {
    const erroInesperado = new Error('falha inesperada');
    jest
      .spyOn(notificacaoEvent, 'parseNotificacaoEvent')
      .mockImplementation(() => {
        throw erroInesperado;
      });
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');

    const resultado = service.processRecord(JSON.stringify(evento));

    await expect(resultado).rejects.toBe(erroInesperado);
    expect(sender.send).not.toHaveBeenCalled();
  });

  describe('correlationId nos logs', () => {
    it('registra o correlationId do evento enviado', async () => {
      const logSpy = jest.spyOn(console, 'log');
      const service = new NotificacaoService(
        criarSenderMock(),
        'oficina@oficina.com',
      );

      await service.processRecord(criarBodySns(envelopePagamentoDisponivel));

      expect(logsDeNotificacao(logSpy)).toEqual([
        expect.objectContaining({
          resultado: 'enviado',
          correlationId: 'corr-pag-1',
          eventId: 'evt-pag-1',
          eventType: PAGAMENTO_DISPONIVEL_EVENT_TYPE,
        }),
      ]);
    });

    it('registra o correlationId na falha transiente', async () => {
      const logSpy = jest.spyOn(console, 'log');
      const sender = criarSenderMock();
      sender.send.mockRejectedValue(new Error('SendGrid 503'));
      const service = new NotificacaoService(sender, 'oficina@oficina.com');

      await expect(
        service.processRecord(criarBodySns(envelopeStatusChanged)),
      ).rejects.toThrow(TransientNotificationError);

      expect(logsDeNotificacao(logSpy)).toEqual([
        expect.objectContaining({
          resultado: 'erro_transiente',
          correlationId: 'corr-env-1',
        }),
      ]);
    });

    it('registra o correlationId do evento inválido lido do envelope', async () => {
      const logSpy = jest.spyOn(console, 'log');
      const service = new NotificacaoService(
        criarSenderMock(),
        'oficina@oficina.com',
      );
      const mensagem = {
        ...envelopePagamentoDisponivel,
        payload: { ...envelopePagamentoDisponivel.payload, valorCentavos: -1 },
      };

      await expect(
        service.processRecord(criarBodySns(mensagem)),
      ).rejects.toThrow(PermanentNotificationError);

      expect(logsDeNotificacao(logSpy)).toEqual([
        expect.objectContaining({
          resultado: 'invalido',
          correlationId: 'corr-pag-1',
          eventId: 'evt-pag-1',
          ordemServicoId: 'uuid-os3',
          eventType: PAGAMENTO_DISPONIVEL_EVENT_TYPE,
        }),
      ]);
    });

    it('usa o atributo correlationId do SNS quando o evento não o traz', async () => {
      const logSpy = jest.spyOn(console, 'log');
      const service = new NotificacaoService(
        criarSenderMock(),
        'oficina@oficina.com',
      );
      const mensagem: Record<string, unknown> = { ...envelopeStatusChanged };
      delete mensagem.correlationId;

      await expect(
        service.processRecord(criarBodySns(mensagem, 'corr-sns-1')),
      ).rejects.toThrow(PermanentNotificationError);

      expect(logsDeNotificacao(logSpy)).toEqual([
        expect.objectContaining({
          resultado: 'invalido',
          correlationId: 'corr-sns-1',
        }),
      ]);
    });

    it('registra identificadores desconhecidos quando o corpo é ilegível', async () => {
      const logSpy = jest.spyOn(console, 'log');
      const service = new NotificacaoService(
        criarSenderMock(),
        'oficina@oficina.com',
      );

      await expect(service.processRecord('não é json')).rejects.toThrow(
        PermanentNotificationError,
      );

      expect(logsDeNotificacao(logSpy)).toEqual([
        expect.objectContaining({
          resultado: 'invalido',
          correlationId: 'desconhecido',
        }),
      ]);
    });
  });

  it('não envia e-mail quando o destinatário não tem e-mail, e registra o motivo', async () => {
    const logSpy = jest.spyOn(console, 'log');
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');
    const mensagem = {
      ...envelopeStatusChanged,
      payload: {
        ...envelopeStatusChanged.payload,
        destinatario: { nome: 'Maria', email: '' },
      },
    };

    await service.processRecord(criarBodySns(mensagem));

    expect(sender.send).not.toHaveBeenCalled();
    expect(logsDeNotificacao(logSpy)).toEqual([
      expect.objectContaining({
        resultado: 'sem_email',
        correlationId: 'corr-env-1',
      }),
    ]);
  });
});

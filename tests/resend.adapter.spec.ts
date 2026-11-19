import { Resend } from 'resend';
import {
  EmailMessage,
  ResendEmailSender,
} from '../src/shared/adapters/resend.adapter';

const mockEmailsSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockEmailsSend(...args) },
  })),
}));

const chaveDeApi = 're_chave_secreta_de_teste';

const mensagem: EmailMessage = {
  from: 'oficina@oficina.com',
  to: 'joao@email.com',
  subject: 'Sua OS #42 mudou de status',
  text: 'Olá João, sua OS está em diagnóstico.',
  html: '<p>Olá <strong>João</strong>, sua OS está em diagnóstico.</p>',
};

const erroDaApi = (name: string, statusCode: number | null) => ({
  data: null,
  error: { name, statusCode, message: 'detalhe com joao@email.com' },
  headers: null,
});

describe('ResendEmailSender', () => {
  let logSpy: jest.SpyInstance;

  const logsRegistrados = () =>
    logSpy.mock.calls.map(
      ([linha]) => JSON.parse(String(linha)) as Record<string, unknown>,
    );

  const metricasDeLatencia = () =>
    logsRegistrados().filter(
      ({ metric }) => metric === 'oficina.integracao.latencia',
    );

  const metricasDeFalha = () =>
    logsRegistrados().filter(
      ({ metric }) => metric === 'oficina.integracao.falha',
    );

  const enviar = () => new ResendEmailSender(chaveDeApi).send(mensagem);

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('inicializa o SDK com a chave de API recebida', () => {
    new ResendEmailSender(chaveDeApi);

    expect(Resend).toHaveBeenCalledWith(chaveDeApi);
  });

  it('envia remetente, destinatário, assunto, html e texto sem alterar o conteúdo', async () => {
    mockEmailsSend.mockResolvedValue({
      data: { id: 'email-1' },
      error: null,
      headers: null,
    });

    await enviar();

    expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    expect(mockEmailsSend).toHaveBeenCalledWith({
      from: mensagem.from,
      to: mensagem.to,
      subject: mensagem.subject,
      html: mensagem.html,
      text: mensagem.text,
    });
  });

  it('registra métrica de sucesso quando o Resend devolve o id do e-mail', async () => {
    mockEmailsSend.mockResolvedValue({
      data: { id: 'email-1' },
      error: null,
      headers: null,
    });

    await expect(enviar()).resolves.toBeUndefined();

    expect(metricasDeLatencia()).toEqual([
      expect.objectContaining({
        evento: 'integracao_metrica',
        integration: 'resend',
        result: 'success',
        durationMs: expect.any(Number),
      }),
    ]);
    expect(metricasDeFalha()).toHaveLength(0);
  });

  it.each([
    ['validation_error', 422],
    ['rate_limit_exceeded', 429],
    ['application_error', 500],
    ['application_error', null],
  ])(
    'lança erro e registra falha quando o Resend retorna %s (%s)',
    async (name, statusCode) => {
      mockEmailsSend.mockResolvedValue(erroDaApi(name, statusCode));

      await expect(enviar()).rejects.toThrow(
        `Resend recusou o envio: ${name} (statusCode ${statusCode ?? 'indisponível'})`,
      );

      expect(metricasDeLatencia()).toEqual([
        expect.objectContaining({
          integration: 'resend',
          result: 'failure',
          durationMs: expect.any(Number),
        }),
      ]);
      expect(metricasDeFalha()).toEqual([
        expect.objectContaining({ integration: 'resend' }),
      ]);
    },
  );

  it('não inclui a chave de API nem dados pessoais na mensagem de erro', async () => {
    mockEmailsSend.mockResolvedValue(erroDaApi('validation_error', 422));

    const erro = await enviar().catch((e: Error) => e);

    expect((erro as Error).message).not.toContain(chaveDeApi);
    expect((erro as Error).message).not.toContain('joao@email.com');
  });

  it.each([
    ['data nulo', { data: null, error: null, headers: null }],
    ['data sem id', { data: {}, error: null, headers: null }],
    ['resposta indefinida', { data: undefined, error: null, headers: null }],
  ])(
    'lança erro e registra falha quando o Resend responde com %s e sem error',
    async (_descricao, resposta) => {
      mockEmailsSend.mockResolvedValue(resposta);

      await expect(enviar()).rejects.toThrow(
        'Resend respondeu sem identificador do e-mail',
      );

      expect(metricasDeLatencia()).toEqual([
        expect.objectContaining({ integration: 'resend', result: 'failure' }),
      ]);
    },
  );

  it('propaga a exceção lançada pelo SDK e registra falha', async () => {
    const falhaDeRede = new Error('fetch failed');
    mockEmailsSend.mockRejectedValue(falhaDeRede);

    await expect(enviar()).rejects.toBe(falhaDeRede);

    expect(metricasDeLatencia()).toEqual([
      expect.objectContaining({ integration: 'resend', result: 'failure' }),
    ]);
    expect(metricasDeFalha()).toHaveLength(1);
  });
});

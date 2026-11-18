import { OsClienteRepository } from '../src/shared/adapters/os-cliente.adapter';
import * as secrets from '../src/shared/services/secrets.service';
import { ConsultaClienteOsError } from '../src/shared/types/consulta-cliente-os.error';

jest.mock('../src/shared/services/secrets.service');

describe('OsClienteRepository', () => {
  const cpf = '52998224725';
  const requestId = '3f2b1c4e-8a6d-4e1f-9b7a-2d5c6e8f0a11';
  const tokenSecreto = 'token-auth-cpf-os-super-secreto';
  const baseUrl = 'http://nlb-interno.exemplo.local';

  const fetchMock = jest.fn();
  const obterCampoSecretMock = jest.mocked(secrets.obterCampoSecret);
  let logSpy: jest.SpyInstance;

  const respostaJson = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status });

  const repository = () => new OsClienteRepository(requestId);

  const todosOsLogs = () =>
    logSpy.mock.calls.map(([linha]) => String(linha)).join('\n');

  beforeEach(() => {
    process.env.OS_SERVICE_BASE_URL = baseUrl;
    process.env.AUTH_CPF_OS_TOKEN_ARN =
      'arn:aws:secretsmanager:token-auth-cpf-os';
    obterCampoSecretMock.mockResolvedValue(tokenSecreto);
    global.fetch = fetchMock;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete process.env.OS_SERVICE_BASE_URL;
    delete process.env.AUTH_CPF_OS_TOKEN_ARN;
  });

  it('retorna o cliente quando o OS responde 200', async () => {
    fetchMock.mockResolvedValue(
      respostaJson(200, { id: 'cliente-1', ativo: true, nome: 'ignorado' }),
    );

    await expect(repository().buscarPorCpf(cpf)).resolves.toEqual({
      id: 'cliente-1',
      ativo: true,
    });
  });

  it('envia GET com token do segredo e identificador da requisicao', async () => {
    fetchMock.mockResolvedValue(respostaJson(200, { id: 'c', ativo: true }));

    await repository().buscarPorCpf(cpf);

    expect(obterCampoSecretMock).toHaveBeenCalledWith(
      'arn:aws:secretsmanager:token-auth-cpf-os',
      'token',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${baseUrl}/internal/clientes?cpf=${cpf}`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({
      Authorization: `Bearer ${tokenSecreto}`,
      'X-Request-Id': requestId,
      'X-Correlation-Id': requestId,
    });
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('ignora barras finais na URL base', async () => {
    process.env.OS_SERVICE_BASE_URL = `${baseUrl}/`;
    fetchMock.mockResolvedValue(respostaJson(200, { id: 'c', ativo: true }));

    await repository().buscarPorCpf(cpf);

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${baseUrl}/internal/clientes?cpf=${cpf}`,
    );
  });

  it('retorna null quando o OS responde 404 CLIENTE_NAO_ENCONTRADO', async () => {
    fetchMock.mockResolvedValue(
      respostaJson(404, { codigo: 'CLIENTE_NAO_ENCONTRADO' }),
    );

    await expect(repository().buscarPorCpf(cpf)).resolves.toBeNull();
  });

  it('trata 404 sem o codigo do OS como resposta invalida, nao como cliente inexistente', async () => {
    fetchMock.mockResolvedValue(
      respostaJson(404, {
        statusCode: 404,
        message: 'Cannot GET /internal/clientes',
      }),
    );

    await expect(repository().buscarPorCpf(cpf)).rejects.toMatchObject({
      motivo: 'resposta_invalida',
      statusHttp: 404,
    });
  });

  it.each([401, 403])(
    'lanca acesso_negado quando o OS responde %i',
    async (status) => {
      fetchMock.mockResolvedValue(respostaJson(status, { message: 'nao' }));

      await expect(repository().buscarPorCpf(cpf)).rejects.toMatchObject({
        motivo: 'acesso_negado',
        statusHttp: status,
      });
    },
  );

  it.each([500, 502, 503])(
    'lanca indisponivel quando o OS responde %i',
    async (status) => {
      fetchMock.mockResolvedValue(respostaJson(status, {}));

      await expect(repository().buscarPorCpf(cpf)).rejects.toMatchObject({
        motivo: 'indisponivel',
        statusHttp: status,
      });
    },
  );

  it('lanca resposta_invalida para status inesperado como 400', async () => {
    fetchMock.mockResolvedValue(respostaJson(400, {}));

    await expect(repository().buscarPorCpf(cpf)).rejects.toMatchObject({
      motivo: 'resposta_invalida',
      statusHttp: 400,
    });
  });

  it('lanca indisponivel em falha de rede', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(repository().buscarPorCpf(cpf)).rejects.toMatchObject({
      motivo: 'indisponivel',
    });
  });

  it('lanca timeout quando o OS nao responde a tempo', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );

    const resultado = expect(
      repository().buscarPorCpf(cpf),
    ).rejects.toMatchObject({ motivo: 'timeout' });
    await jest.advanceTimersByTimeAsync(3000);

    await resultado;
  });

  it.each([
    ['corpo sem id', { ativo: true }],
    ['id vazio', { id: '', ativo: true }],
    ['ativo que nao e booleano', { id: 'c', ativo: 'sim' }],
    ['corpo nulo', null],
  ])('lanca resposta_invalida para 200 com %s', async (_descricao, corpo) => {
    fetchMock.mockResolvedValue(respostaJson(200, corpo));

    await expect(repository().buscarPorCpf(cpf)).rejects.toMatchObject({
      motivo: 'resposta_invalida',
    });
  });

  it('lanca resposta_invalida quando o corpo nao e JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));

    await expect(repository().buscarPorCpf(cpf)).rejects.toBeInstanceOf(
      ConsultaClienteOsError,
    );
  });

  it('falha sem chamar o OS quando a URL base nao esta configurada', async () => {
    delete process.env.OS_SERVICE_BASE_URL;

    await expect(repository().buscarPorCpf(cpf)).rejects.toThrow(
      'OS_SERVICE_BASE_URL nao configurado',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falha sem chamar o OS quando o ARN do token nao esta configurado', async () => {
    delete process.env.AUTH_CPF_OS_TOKEN_ARN;

    await expect(repository().buscarPorCpf(cpf)).rejects.toThrow(
      'AUTH_CPF_OS_TOKEN_ARN nao configurado',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propaga a falha de leitura do segredo sem chamar o OS', async () => {
    obterCampoSecretMock.mockRejectedValue(
      new Error('Secret sem o campo token'),
    );

    await expect(repository().buscarPorCpf(cpf)).rejects.toThrow(
      'Secret sem o campo token',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('logs e mensagens', () => {
    it('registra a metrica com o identificador da requisicao, sem CPF nem token', async () => {
      fetchMock.mockResolvedValue(respostaJson(200, { id: 'c', ativo: true }));

      await repository().buscarPorCpf(cpf);

      expect(JSON.parse(logSpy.mock.calls[0][0])).toMatchObject({
        integration: 'os_service',
        result: 'success',
        correlationId: requestId,
      });
      expect(todosOsLogs()).not.toContain(cpf);
      expect(todosOsLogs()).not.toContain(tokenSecreto);
    });

    it('registra falha da integracao sem CPF nem token', async () => {
      fetchMock.mockResolvedValue(respostaJson(503, {}));

      await repository()
        .buscarPorCpf(cpf)
        .catch(() => undefined);

      expect(todosOsLogs()).toContain('"result":"failure"');
      expect(todosOsLogs()).not.toContain(cpf);
      expect(todosOsLogs()).not.toContain(tokenSecreto);
    });

    it.each([
      ['5xx', () => respostaJson(500, { detalhe: cpf })],
      ['401', () => respostaJson(401, { detalhe: tokenSecreto })],
    ])(
      'a mensagem do erro %s nao vaza CPF nem token',
      async (_nome, resposta) => {
        fetchMock.mockResolvedValue(resposta());

        const erro = (await repository()
          .buscarPorCpf(cpf)
          .catch((e: Error) => e)) as Error;

        expect(erro.message).not.toContain(cpf);
        expect(erro.message).not.toContain(tokenSecreto);
      },
    );

    it('a mensagem do erro de rede nao vaza CPF nem token', async () => {
      fetchMock.mockRejectedValue(
        new TypeError(
          `falha em ${baseUrl}/internal/clientes?cpf=${cpf} com ${tokenSecreto}`,
        ),
      );

      const erro = (await repository()
        .buscarPorCpf(cpf)
        .catch((e: Error) => e)) as Error;

      expect(erro.message).not.toContain(cpf);
      expect(erro.message).not.toContain(tokenSecreto);
    });
  });
});

import { generateKeyPairSync } from 'crypto';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import { handler } from '../src/functions/auth-cpf/handler';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/shared/config/auth.config';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({
    send: (...argumentos: unknown[]) => sendMock(...argumentos),
  })),
  GetSecretValueCommand: jest.fn((input: unknown) => input),
}));
jest.mock('../src/shared/services/timing-pad.service');

describe('handler auth-cpf', () => {
  const cpf = '52998224725';
  const cpfFormatado = '529.982.247-25';
  const awsRequestId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  const tokenOs = 'token-auth-cpf-os-super-secreto';
  const arnJwt = 'arn:aws:secretsmanager:jwt-private';
  const arnTokenOs = 'arn:aws:secretsmanager:token-auth-cpf-os';

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const fetchMock = jest.fn();
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const contexto = { awsRequestId } as Context;

  const evento = (
    corpo: unknown,
    headers: Record<string, string> = {},
  ): APIGatewayProxyEvent =>
    ({
      httpMethod: 'POST',
      body: JSON.stringify(corpo),
      headers,
      requestContext: {
        requestId: 'id-do-api-gateway',
        identity: { sourceIp: '203.0.113.10' },
      },
    }) as unknown as APIGatewayProxyEvent;

  const respostaOs = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status });

  const linhasDeLog = (spy: jest.SpyInstance) =>
    spy.mock.calls.map(([linha]) => JSON.parse(String(linha)));

  const todosOsLogs = () =>
    [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map(([linha]) => String(linha))
      .join('\n');

  beforeEach(() => {
    process.env.OS_SERVICE_BASE_URL = 'http://nlb-interno.exemplo.local';
    process.env.AUTH_CPF_OS_TOKEN_ARN = arnTokenOs;
    process.env.JWT_SECRET_ARN = arnJwt;
    sendMock.mockImplementation(async ({ SecretId }: { SecretId: string }) => ({
      SecretString:
        SecretId === arnJwt
          ? JSON.stringify({ privateKey })
          : JSON.stringify({ token: tokenOs }),
    }));
    global.fetch = fetchMock;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.OS_SERVICE_BASE_URL;
    delete process.env.AUTH_CPF_OS_TOKEN_ARN;
    delete process.env.JWT_SECRET_ARN;
  });

  it('responde 200 com token RS256 aceito pela chave publica', async () => {
    fetchMock.mockResolvedValue(respostaOs(200, { id: 'cliente-1', ativo: true }));

    const resultado = await handler(evento({ cpf: cpfFormatado }), contexto);

    expect(resultado.statusCode).toBe(200);
    const { accessToken } = JSON.parse(resultado.body);
    const payload = jwt.verify(accessToken, publicKey, {
      algorithms: ['RS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as jwt.JwtPayload;
    expect(payload).toMatchObject({
      sub: 'cliente-1',
      tipo: 'CLIENTE',
      perfil: 'CLIENTE',
    });
  });

  it('consulta o OS com o CPF limpo, o token auth-cpf-os e o identificador da requisicao', async () => {
    fetchMock.mockResolvedValue(respostaOs(200, { id: 'cliente-1', ativo: true }));

    await handler(evento({ cpf: cpfFormatado }), contexto);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `http://nlb-interno.exemplo.local/internal/clientes?cpf=${cpf}`,
    );
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${tokenOs}`,
      'X-Request-Id': awsRequestId,
    });
  });

  it('usa o awsRequestId nos logs e no header de resposta, ignorando o X-Correlation-Id do cliente', async () => {
    fetchMock.mockResolvedValue(respostaOs(200, { id: 'cliente-1', ativo: true }));

    const resultado = await handler(
      evento({ cpf: cpf }, { 'x-correlation-id': 'valor-do-cliente\ninjetado' }),
      contexto,
    );

    expect(resultado.headers?.['X-Correlation-Id']).toBe(awsRequestId);
    const eventos = linhasDeLog(logSpy);
    expect(eventos.length).toBeGreaterThan(0);
    eventos.forEach((linha) => expect(linha.correlationId).toBe(awsRequestId));
    expect(todosOsLogs()).not.toContain('valor-do-cliente');
  });

  it('responde 401 quando o OS nao encontra o cliente', async () => {
    fetchMock.mockResolvedValue(
      respostaOs(404, { codigo: 'CLIENTE_NAO_ENCONTRADO' }),
    );

    const resultado = await handler(evento({ cpf }), contexto);

    expect(resultado.statusCode).toBe(401);
    expect(JSON.parse(resultado.body).code).toBe('NAO_AUTORIZADO');
  });

  it('responde 401 para cliente inativo', async () => {
    fetchMock.mockResolvedValue(respostaOs(200, { id: 'cliente-1', ativo: false }));

    const resultado = await handler(evento({ cpf }), contexto);

    expect(resultado.statusCode).toBe(401);
  });

  it.each([
    ['5xx', () => respostaOs(503, {})],
    ['401 do OS', () => respostaOs(401, {})],
    ['403 do OS', () => respostaOs(403, {})],
  ])('responde 500 ERRO_INTERNO e registra o erro quando o OS devolve %s', async (_nome, resposta) => {
    fetchMock.mockResolvedValue(resposta());

    const resultado = await handler(evento({ cpf }), contexto);

    expect(resultado.statusCode).toBe(500);
    expect(JSON.parse(resultado.body)).toEqual({
      error: 'Erro interno do servidor',
      code: 'ERRO_INTERNO',
    });
    expect(resultado.headers?.['X-Correlation-Id']).toBe(awsRequestId);

    const [erro] = linhasDeLog(errorSpy);
    expect(erro).toMatchObject({
      evento: 'auth_cpf_erro',
      correlationId: awsRequestId,
      erro: 'ConsultaClienteOsError',
    });
    expect(linhasDeLog(logSpy)).toContainEqual(
      expect.objectContaining({
        evento: 'auth_cpf',
        resultado: 'erro_interno',
        correlationId: awsRequestId,
      }),
    );
  });

  it('responde 500 e registra o motivo indisponivel quando o fetch falha', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'));

    const resultado = await handler(evento({ cpf }), contexto);

    expect(resultado.statusCode).toBe(500);
    expect(linhasDeLog(errorSpy)[0]).toMatchObject({ motivo: 'indisponivel' });
  });

  it('registra erro nao previsto sem expor a mensagem', async () => {
    delete process.env.OS_SERVICE_BASE_URL;

    const resultado = await handler(evento({ cpf }), contexto);

    expect(resultado.statusCode).toBe(500);
    expect(linhasDeLog(errorSpy)[0]).toEqual({
      evento: 'auth_cpf_erro',
      correlationId: awsRequestId,
      erro: 'Error',
    });
  });

  it('nao registra CPF nem token em nenhum caminho de log', async () => {
    fetchMock.mockResolvedValueOnce(respostaOs(200, { id: 'cliente-1', ativo: true }));
    fetchMock.mockResolvedValueOnce(
      respostaOs(404, { codigo: 'CLIENTE_NAO_ENCONTRADO' }),
    );
    fetchMock.mockResolvedValueOnce(respostaOs(500, { detalhe: cpf }));
    fetchMock.mockRejectedValueOnce(
      new TypeError(`falha com ${cpf} e ${tokenOs}`),
    );

    for (let tentativa = 0; tentativa < 4; tentativa++) {
      await handler(evento({ cpf: cpfFormatado }), contexto);
    }

    const logs = todosOsLogs();
    expect(logs).not.toContain(cpf);
    expect(logs).not.toContain(cpfFormatado);
    expect(logs).not.toContain(tokenOs);
    expect(logs).not.toContain(privateKey.slice(40, 80));
  });

  it('responde OPTIONS sem consultar o OS', async () => {
    const resultado = await handler(
      { httpMethod: 'OPTIONS' } as APIGatewayProxyEvent,
      contexto,
    );

    expect(resultado.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

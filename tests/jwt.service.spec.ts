import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import {
  gerarTokenCliente,
  verificarTokenCliente,
} from '../src/shared/services/jwt.service';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/shared/config/auth.config';
import { limparCacheSecrets } from '../src/shared/services/secrets.service';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({
    send: (...argumentos: unknown[]) => sendMock(...argumentos),
  })),
  GetSecretValueCommand: jest.fn((input: unknown) => input),
}));

function gerarParDeChaves() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

describe('jwt.service', () => {
  const par = gerarParDeChaves();
  const outroPar = gerarParDeChaves();

  beforeEach(() => {
    limparCacheSecrets();
    process.env.JWT_SECRET_ARN = 'arn:aws:secretsmanager:jwt-private';
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ privateKey: par.privateKey }),
    });
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.JWT_SECRET_ARN;
  });

  it('le a chave privada do campo privateKey do segredo', async () => {
    await gerarTokenCliente('cliente-123');

    expect(sendMock).toHaveBeenCalledWith({
      SecretId: 'arn:aws:secretsmanager:jwt-private',
    });
  });

  it('assina com RS256', async () => {
    const token = await gerarTokenCliente('cliente-123');
    const { header } = jwt.decode(token, { complete: true }) as jwt.Jwt;

    expect(header.alg).toBe('RS256');
  });

  it('gera token com claims exigidos sem PII', async () => {
    const token = await gerarTokenCliente('cliente-123');
    const payload = jwt.decode(token) as jwt.JwtPayload;

    expect(payload.sub).toBe('cliente-123');
    expect(payload.tipo).toBe('CLIENTE');
    expect(payload.perfil).toBe('CLIENTE');
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.aud).toBe(JWT_AUDIENCE);
    expect(payload.jti).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect(payload).not.toHaveProperty('cpf');
    expect(payload).not.toHaveProperty('nome');
    expect(payload).not.toHaveProperty('email');
  });

  it('e aceito pelas opcoes de validacao do OS com a chave publica correspondente', async () => {
    const token = await gerarTokenCliente('cliente-123');

    // Espelha o JwtAuthGuard do OS: verifyAsync com algorithms RS256, emissor
    // e audiencia conferidos e tipo e perfil CLIENTE.
    const payload = jwt.verify(token, par.publicKey, {
      algorithms: ['RS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as jwt.JwtPayload;

    expect(payload.sub).toBe('cliente-123');
    expect(payload.tipo).toBe('CLIENTE');
    expect(payload.perfil).toBe('CLIENTE');
  });

  it('valida issuer, audience e assinatura', async () => {
    const token = await gerarTokenCliente('cliente-123');
    const payload = verificarTokenCliente(token, par.publicKey);

    expect(payload.sub).toBe('cliente-123');
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.aud).toBe(JWT_AUDIENCE);
  });

  it('rejeita a validacao com outra chave publica', async () => {
    const token = await gerarTokenCliente('cliente-123');

    expect(() => verificarTokenCliente(token, outroPar.publicKey)).toThrow(
      'invalid signature',
    );
  });

  it('rejeita token com issuer invalido', () => {
    const token = jwt.sign(
      { sub: 'x', tipo: 'CLIENTE', perfil: 'CLIENTE' },
      par.privateKey,
      { algorithm: 'RS256', issuer: 'outro-issuer', audience: JWT_AUDIENCE },
    );

    expect(() => verificarTokenCliente(token, par.publicKey)).toThrow();
  });

  it('rejeita token HS256 assinado com a chave publica como segredo', () => {
    const token = jwt.sign(
      { sub: 'x', tipo: 'CLIENTE', perfil: 'CLIENTE' },
      par.publicKey,
      { algorithm: 'HS256', issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    );

    expect(() => verificarTokenCliente(token, par.publicKey)).toThrow();
  });

  it('falha quando JWT_SECRET_ARN nao esta configurado', async () => {
    delete process.env.JWT_SECRET_ARN;

    await expect(gerarTokenCliente('cliente-123')).rejects.toThrow(
      'JWT_SECRET_ARN nao configurado',
    );
  });

  it('falha quando o segredo nao tem o campo privateKey (formato HS256 legado)', async () => {
    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({ secret: 'legado' }),
    });

    await expect(gerarTokenCliente('cliente-123')).rejects.toThrow(
      'sem o campo privateKey',
    );
  });
});

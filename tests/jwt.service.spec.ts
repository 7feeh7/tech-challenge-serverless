import jwt from 'jsonwebtoken';
import {
  gerarTokenCliente,
  verificarTokenCliente,
} from '../src/shared/services/jwt.service';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/shared/config/auth.config';

describe('jwt.service', () => {
  const secret = 'segredo-teste-local';

  beforeEach(() => {
    process.env.JWT_SECRET = secret;
    delete process.env.JWT_SECRET_ARN;
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

  it('valida issuer, audience e assinatura', async () => {
    const token = await gerarTokenCliente('cliente-123');
    const payload = verificarTokenCliente(token, secret);

    expect(payload.sub).toBe('cliente-123');
    expect(payload.iss).toBe(JWT_ISSUER);
    expect(payload.aud).toBe(JWT_AUDIENCE);
  });

  it('rejeita token com issuer invalido', async () => {
    const token = jwt.sign({ sub: 'x', tipo: 'CLIENTE', perfil: 'CLIENTE' }, secret, {
      issuer: 'outro-issuer',
      audience: JWT_AUDIENCE,
    });

    expect(() => verificarTokenCliente(token, secret)).toThrow();
  });
});

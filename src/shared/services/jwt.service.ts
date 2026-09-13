import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import {
  JWT_ALGORITHM,
  JWT_AUDIENCE,
  JWT_EXPIRES_IN,
  JWT_ISSUER,
  PERFIL_CLIENTE,
  TIPO_TOKEN_CLIENTE,
} from '../config/auth.config';
import { ClienteTokenPayload } from '../types';
import { obterSecret } from './secrets.service';

const EXPIRES_IN_SECONDS = 3600;

async function obterJwtSecret(): Promise<string> {
  const secretArn = process.env.JWT_SECRET_ARN;
  if (secretArn) {
    const raw = await obterSecret(secretArn);
    try {
      const parsed = JSON.parse(raw) as { secret?: string };
      return parsed.secret ?? raw;
    } catch {
      return raw;
    }
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET ou JWT_SECRET_ARN nao configurado');
  }

  return secret;
}

export async function gerarTokenCliente(clienteId: string): Promise<string> {
  const secret = await obterJwtSecret();

  const payload: ClienteTokenPayload = {
    sub: clienteId,
    tipo: TIPO_TOKEN_CLIENTE,
    perfil: PERFIL_CLIENTE,
  };

  return jwt.sign(payload, secret, {
    algorithm: JWT_ALGORITHM,
    expiresIn: obterExpiracaoSegundos(),
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    jwtid: randomUUID(),
  });
}

export function obterExpiracaoSegundos(): number {
  if (JWT_EXPIRES_IN.endsWith('h')) {
    return parseInt(JWT_EXPIRES_IN, 10) * 3600;
  }
  if (JWT_EXPIRES_IN.endsWith('m')) {
    return parseInt(JWT_EXPIRES_IN, 10) * 60;
  }
  return EXPIRES_IN_SECONDS;
}

export function verificarTokenCliente(
  token: string,
  secret: string,
): jwt.JwtPayload {
  return jwt.verify(token, secret, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as jwt.JwtPayload;
}

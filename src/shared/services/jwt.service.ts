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
import { obterCampoSecret } from './secrets.service';

const EXPIRES_IN_SECONDS = 3600;

async function obterChavePrivada(): Promise<string> {
  // O nome JWT_SECRET_ARN e legado: o segredo guarda a chave privada RS256.
  const secretArn = process.env.JWT_SECRET_ARN;
  if (!secretArn) {
    throw new Error('JWT_SECRET_ARN nao configurado');
  }

  return obterCampoSecret(secretArn, 'privateKey');
}

export async function gerarTokenCliente(clienteId: string): Promise<string> {
  const chavePrivada = await obterChavePrivada();

  const payload: ClienteTokenPayload = {
    sub: clienteId,
    tipo: TIPO_TOKEN_CLIENTE,
    perfil: PERFIL_CLIENTE,
  };

  return jwt.sign(payload, chavePrivada, {
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
  chavePublica: string,
): jwt.JwtPayload {
  return jwt.verify(token, chavePublica, {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as jwt.JwtPayload;
}

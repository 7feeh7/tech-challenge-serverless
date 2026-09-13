import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types';

export function gerarToken(payload: TokenPayload): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET nao configurado');
  }

  return jwt.sign(payload, secret, {
    expiresIn: '1h',
    issuer: 'tech-challenge-auth',
  });
}

export const JWT_ISSUER = process.env.JWT_ISSUER ?? 'tech-challenge-auth';
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'tech-challenge-api';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1h';
export const JWT_ALGORITHM = 'HS256' as const;

export const TIPO_TOKEN_CLIENTE = 'CLIENTE' as const;
export const PERFIL_CLIENTE = 'CLIENTE' as const;

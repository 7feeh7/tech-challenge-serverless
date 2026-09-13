export interface ClienteAuth {
  id: string;
  ativo: boolean;
}

export interface ClienteTokenPayload {
  sub: string;
  tipo: 'CLIENTE';
  perfil: 'CLIENTE';
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface ErrorResponse {
  error: string;
  code: string;
}

export * from './status-changed.event';

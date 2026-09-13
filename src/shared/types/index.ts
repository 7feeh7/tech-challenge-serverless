export interface Cliente {
  id: string;
  nome: string;
  documento: string;
  email: string;
  telefone?: string;
}

export interface TokenPayload {
  sub: string;
  cpf: string;
  nome: string;
  email: string;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  cliente: {
    id: string;
    nome: string;
    email: string;
  };
}

export interface ErrorResponse {
  error: string;
}

export interface NotificacaoPayload {
  destinatario: string;
  assunto: string;
  corpo: string;
}

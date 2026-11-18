import { ConsultaClienteOsError } from '../types/consulta-cliente-os.error';

export interface LogContext {
  correlationId: string;
  resultado:
    | 'sucesso'
    | 'nao_autorizado'
    | 'cpf_invalido'
    | 'body_invalido'
    | 'rate_limit'
    | 'erro_interno';
  duracaoMs: number;
  cpfMascarado?: string;
}

export function mascararCpf(cpf: string): string {
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11) return '***';
  return `***.***.${digitos.slice(6, 9)}-**`;
}

export function logAuthEvent(context: LogContext): void {
  console.log(
    JSON.stringify({
      evento: 'auth_cpf',
      correlationId: context.correlationId,
      resultado: context.resultado,
      duracaoMs: context.duracaoMs,
      ...(context.cpfMascarado ? { cpf: context.cpfMascarado } : {}),
    }),
  );
}

// Registra so o tipo e o motivo da falha: mensagens de erro de bibliotecas
// podem citar URL, CPF ou trechos de segredo.
export function logErroInterno(correlationId: string, error: unknown): void {
  const detalhes =
    error instanceof ConsultaClienteOsError
      ? { motivo: error.motivo, statusOs: error.statusHttp }
      : {};

  console.error(
    JSON.stringify({
      evento: 'auth_cpf_erro',
      correlationId,
      erro: error instanceof Error ? error.name : 'desconhecido',
      ...detalhes,
    }),
  );
}

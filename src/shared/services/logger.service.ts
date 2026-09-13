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

export type MotivoFalhaConsultaClienteOs =
  | 'timeout'
  | 'acesso_negado'
  | 'indisponivel'
  | 'resposta_invalida';

/** Falha ao consultar o cliente no OS. Nunca carrega CPF, token nem corpo da resposta. */
export class ConsultaClienteOsError extends Error {
  constructor(
    readonly motivo: MotivoFalhaConsultaClienteOs,
    readonly statusHttp?: number,
  ) {
    super(`Falha na consulta de cliente no OS: ${motivo}`);
    this.name = 'ConsultaClienteOsError';
  }
}

export interface NotificationLogContext {
  correlationId: string;
  eventId: string;
  ordemServicoId: string;
  resultado:
    | 'enviado'
    | 'deduplicado'
    | 'invalido'
    | 'sem_email'
    | 'erro_transiente';
  duracaoMs: number;
  detalhe?: string;
}

export function logNotificationEvent(context: NotificationLogContext): void {
  console.log(
    JSON.stringify({
      evento: 'notificacao_status',
      ...context,
    }),
  );
}

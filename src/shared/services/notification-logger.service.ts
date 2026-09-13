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

import { sanitizarDetalhe } from './pii-mask.service';

export function logNotificationEvent(context: NotificationLogContext): void {
  console.log(
    JSON.stringify({
      evento: 'notificacao_status',
      service: process.env.AWS_LAMBDA_FUNCTION_NAME ?? 'notificacao',
      environment: process.env.NODE_ENV ?? 'development',
      integration: 'sqs',
      ...context,
      detalhe: sanitizarDetalhe(context.detalhe),
    }),
  );

  if (context.resultado === 'erro_transiente') {
    console.log(
      JSON.stringify({
        evento: 'integracao_metrica',
        metric: 'oficina.integracao.falha',
        integration: 'sendgrid',
        correlationId: context.correlationId,
        environment: process.env.NODE_ENV ?? 'development',
      }),
    );
  }
}

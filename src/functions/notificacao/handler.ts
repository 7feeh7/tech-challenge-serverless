import { SQSEvent, SQSRecord } from 'aws-lambda';
import { ResendEmailSender } from '../../shared/adapters/resend.adapter';
import { sanitizarDetalhe } from '../../shared/services/pii-mask.service';
import { obterSecret } from '../../shared/services/secrets.service';
import { extractMessageIdentifiers } from '../../shared/types/notificacao.event';
import {
  NotificacaoService,
  PermanentNotificationError,
} from './notificacao.service';

let cachedService: NotificacaoService | undefined;

async function getService(): Promise<NotificacaoService> {
  if (cachedService) {
    return cachedService;
  }

  const secretArn = process.env.RESEND_SECRET_ARN;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!secretArn || !fromEmail) {
    throw new Error('RESEND_SECRET_ARN/RESEND_FROM_EMAIL não configurados');
  }

  const secretJson = await obterSecret(secretArn);
  const parsed = JSON.parse(secretJson) as { apiKey?: string };
  const apiKey = parsed.apiKey ?? secretJson;

  cachedService = new NotificacaoService(
    new ResendEmailSender(apiKey),
    fromEmail,
  );

  return cachedService;
}

export const handler = async (
  event: SQSEvent,
): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> => {
  const service = await getService();
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      await service.processRecord(record.body);
    } catch (error) {
      logRecordFailure(record, error);
      // Falha permanente também é reportada: a mensagem volta à fila e segue
      // para a DLQ ao atingir o maxReceiveCount, em vez de ser descartada.
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};

function logRecordFailure(record: SQSRecord, error: unknown): void {
  const evento =
    error instanceof PermanentNotificationError
      ? 'notificacao_status_permanente'
      : 'notificacao_status_retry';

  console.error(
    JSON.stringify({
      evento,
      messageId: record.messageId,
      correlationId: extractMessageIdentifiers(record.body).correlationId,
      erro: sanitizarDetalhe(
        error instanceof Error ? error.message : String(error),
      ),
    }),
  );
}

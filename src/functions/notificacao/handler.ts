import { SQSEvent, SQSRecord } from 'aws-lambda';
import { SendGridEmailSender } from '../../shared/adapters/sendgrid.adapter';
import { obterSecret } from '../../shared/services/secrets.service';
import {
  NotificacaoService,
  PermanentNotificationError,
} from './notificacao.service';

let cachedService: NotificacaoService | undefined;

async function getService(): Promise<NotificacaoService> {
  if (cachedService) {
    return cachedService;
  }

  const secretArn = process.env.SENDGRID_SECRET_ARN;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;

  if (!secretArn || !fromEmail) {
    throw new Error('SENDGRID_SECRET_ARN/SENDGRID_FROM_EMAIL não configurados');
  }

  const secretJson = await obterSecret(secretArn);
  const parsed = JSON.parse(secretJson) as { apiKey?: string };
  const apiKey = parsed.apiKey ?? secretJson;

  cachedService = new NotificacaoService(
    new SendGridEmailSender(apiKey),
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
      await processRecord(service, record);
    } catch (error) {
      if (error instanceof PermanentNotificationError) {
        console.error(
          JSON.stringify({
            evento: 'notificacao_status_permanente',
            messageId: record.messageId,
            erro: error.message,
          }),
        );
        continue;
      }

      console.error(
        JSON.stringify({
          evento: 'notificacao_status_retry',
          messageId: record.messageId,
          erro: error instanceof Error ? error.message : String(error),
        }),
      );
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};

async function processRecord(
  service: NotificacaoService,
  record: SQSRecord,
): Promise<void> {
  await service.processRecord(record.body);
}

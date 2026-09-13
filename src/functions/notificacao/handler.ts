import { SQSEvent, SQSRecord } from 'aws-lambda';
import { NotificacaoPayload } from '../../shared/types';

export const handler = async (event: SQSEvent): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> => {
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Falha ao processar notificacao:', error);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};

async function processRecord(record: SQSRecord): Promise<void> {
  const payload = JSON.parse(record.body) as NotificacaoPayload;

  if (!payload.destinatario || !payload.assunto || !payload.corpo) {
    throw new Error('Payload de notificacao incompleto');
  }

  // Adaptador de e-mail sera implementado na spec 004
  console.log('Notificacao enfileirada:', {
    destinatario: payload.destinatario,
    assunto: payload.assunto,
  });
}

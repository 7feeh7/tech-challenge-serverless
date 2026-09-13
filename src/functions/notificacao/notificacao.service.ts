import { EmailSender } from '../../shared/adapters/sendgrid.adapter';
import { buildStatusChangedEmail } from '../../shared/services/email-content.service';
import {
  markEventProcessed,
  wasEventProcessed,
} from '../../shared/services/dedupe.service';
import { logNotificationEvent } from '../../shared/services/notification-logger.service';
import {
  InvalidStatusChangedEventError,
  StatusChangedEventV1,
  extractEventFromSqsBody,
  parseStatusChangedEvent,
} from '../../shared/types/status-changed.event';

export class PermanentNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentNotificationError';
  }
}

export class TransientNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientNotificationError';
  }
}

export class NotificacaoService {
  constructor(
    private readonly emailSender: EmailSender,
    private readonly fromEmail: string,
  ) {}

  async processRecord(body: string): Promise<void> {
    const startedAt = Date.now();

    let event: StatusChangedEventV1;
    try {
      event = parseStatusChangedEvent(extractEventFromSqsBody(body));
    } catch (error) {
      if (error instanceof InvalidStatusChangedEventError) {
        logNotificationEvent({
          correlationId: 'desconhecido',
          eventId: 'desconhecido',
          ordemServicoId: 'desconhecido',
          resultado: 'invalido',
          duracaoMs: Date.now() - startedAt,
          detalhe: error.message,
        });
        throw new PermanentNotificationError(error.message);
      }
      throw error;
    }

    if (!event.destinatario.email) {
      logNotificationEvent({
        correlationId: event.correlationId,
        eventId: event.eventId,
        ordemServicoId: event.ordemServicoId,
        resultado: 'sem_email',
        duracaoMs: Date.now() - startedAt,
      });
      return;
    }

    if (wasEventProcessed(event.eventId)) {
      logNotificationEvent({
        correlationId: event.correlationId,
        eventId: event.eventId,
        ordemServicoId: event.ordemServicoId,
        resultado: 'deduplicado',
        duracaoMs: Date.now() - startedAt,
      });
      return;
    }

    const email = buildStatusChangedEmail(event);

    try {
      await this.emailSender.send({
        ...email,
        from: this.fromEmail,
      });
      markEventProcessed(event.eventId);

      logNotificationEvent({
        correlationId: event.correlationId,
        eventId: event.eventId,
        ordemServicoId: event.ordemServicoId,
        resultado: 'enviado',
        duracaoMs: Date.now() - startedAt,
      });
    } catch (error) {
      logNotificationEvent({
        correlationId: event.correlationId,
        eventId: event.eventId,
        ordemServicoId: event.ordemServicoId,
        resultado: 'erro_transiente',
        duracaoMs: Date.now() - startedAt,
        detalhe: error instanceof Error ? error.message : String(error),
      });
      throw new TransientNotificationError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

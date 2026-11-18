import { InvalidNotificationEventError } from './invalid-notification-event.error';
import {
  PAGAMENTO_DISPONIVEL_EVENT_TYPE,
  PagamentoDisponivelEventV1,
  parsePagamentoDisponivelEvent,
} from './pagamento-disponivel.event';
import {
  STATUS_CHANGED_EVENT_TYPE,
  StatusChangedEventV1,
  extractEventFromSqsBody,
  parseStatusChangedEvent,
} from './status-changed.event';

export type NotificacaoEvent = StatusChangedEventV1 | PagamentoDisponivelEventV1;

export interface MessageIdentifiers {
  correlationId: string;
  eventId: string;
  ordemServicoId: string;
  eventType: string;
}

const UNKNOWN_IDENTIFIER = 'desconhecido';

export function parseNotificacaoEvent(body: string): NotificacaoEvent {
  const event = unwrapEnvelope(extractEventFromSqsBody(body));
  const eventType = isRecord(event) ? event.eventType : undefined;

  switch (eventType) {
    case STATUS_CHANGED_EVENT_TYPE:
      return parseStatusChangedEvent(event);
    case PAGAMENTO_DISPONIVEL_EVENT_TYPE:
      return parsePagamentoDisponivelEvent(event);
    default:
      throw new InvalidNotificationEventError(
        `Tipo de evento não suportado: ${String(eventType)}`,
      );
  }
}

// Lê os identificadores para os logs mesmo quando a mensagem é inválida, sem
// nunca lançar: o log de uma falha não pode esconder a falha original.
export function extractMessageIdentifiers(body: string): MessageIdentifiers {
  const identifiers: MessageIdentifiers = {
    correlationId: UNKNOWN_IDENTIFIER,
    eventId: UNKNOWN_IDENTIFIER,
    ordemServicoId: UNKNOWN_IDENTIFIER,
    eventType: UNKNOWN_IDENTIFIER,
  };

  try {
    const event = unwrapEnvelope(extractEventFromSqsBody(body));

    if (isRecord(event)) {
      identifiers.correlationId =
        readString(event.correlationId) ??
        readSnsCorrelationId(body) ??
        identifiers.correlationId;
      identifiers.eventId = readString(event.eventId) ?? identifiers.eventId;
      identifiers.ordemServicoId =
        readString(event.ordemServicoId) ?? identifiers.ordemServicoId;
      identifiers.eventType =
        readString(event.eventType) ?? identifiers.eventType;
    }
  } catch {
    // Corpo ilegível: mantém os identificadores desconhecidos.
  }

  return identifiers;
}

// O OS publica no SNS um envelope com os dados do evento em `payload`; o
// formato legado (anterior à Fase 4) traz os dados na raiz.
function unwrapEnvelope(message: unknown): unknown {
  if (!isRecord(message) || !('payload' in message)) {
    return message;
  }

  const { payload, ...envelope } = message;

  if (!isRecord(payload)) {
    throw new InvalidNotificationEventError('payload do envelope é inválido');
  }

  return { ...payload, ...envelope };
}

// Atributo `correlationId` que o SNS entrega no corpo da mensagem SQS.
function readSnsCorrelationId(body: string): string | undefined {
  const sqsBody: unknown = JSON.parse(body);

  if (!isRecord(sqsBody) || !isRecord(sqsBody.MessageAttributes)) {
    return undefined;
  }

  const attribute = sqsBody.MessageAttributes.correlationId;

  return isRecord(attribute) ? readString(attribute.Value) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

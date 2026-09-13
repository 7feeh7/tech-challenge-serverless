export enum StatusOS {
  RECEBIDA = 'RECEBIDA',
  EM_DIAGNOSTICO = 'EM_DIAGNOSTICO',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  FINALIZADA = 'FINALIZADA',
  ENTREGUE = 'ENTREGUE',
}

export const STATUS_CHANGED_EVENT_TYPE =
  'ordem-servico.status-changed.v1' as const;

export const STATUS_CHANGED_EVENT_VERSION = 1 as const;

export interface StatusChangedEventV1 {
  version: typeof STATUS_CHANGED_EVENT_VERSION;
  eventId: string;
  eventType: typeof STATUS_CHANGED_EVENT_TYPE;
  occurredAt: string;
  correlationId: string;
  ordemServicoId: string;
  numeroOS?: number;
  statusAnterior: StatusOS | null;
  statusNovo: StatusOS;
  destinatario: {
    nome: string;
    email: string;
  };
}

const STATUS_VALUES = new Set<string>(Object.values(StatusOS));

export class InvalidStatusChangedEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStatusChangedEventError';
  }
}

export function parseStatusChangedEvent(
  payload: unknown,
): StatusChangedEventV1 {
  if (!payload || typeof payload !== 'object') {
    throw new InvalidStatusChangedEventError('Event payload must be an object');
  }

  const event = payload as Partial<StatusChangedEventV1>;

  if (event.version !== STATUS_CHANGED_EVENT_VERSION) {
    throw new InvalidStatusChangedEventError(
      `Unsupported event version: ${String(event.version)}`,
    );
  }

  if (event.eventType !== STATUS_CHANGED_EVENT_TYPE) {
    throw new InvalidStatusChangedEventError(
      `Unsupported event type: ${String(event.eventType)}`,
    );
  }

  if (!event.eventId || typeof event.eventId !== 'string') {
    throw new InvalidStatusChangedEventError('eventId is required');
  }

  if (!event.correlationId || typeof event.correlationId !== 'string') {
    throw new InvalidStatusChangedEventError('correlationId is required');
  }

  if (!event.ordemServicoId || typeof event.ordemServicoId !== 'string') {
    throw new InvalidStatusChangedEventError('ordemServicoId is required');
  }

  if (!event.occurredAt || typeof event.occurredAt !== 'string') {
    throw new InvalidStatusChangedEventError('occurredAt is required');
  }

  if (
    event.statusAnterior !== null &&
    (!event.statusAnterior || !STATUS_VALUES.has(event.statusAnterior))
  ) {
    throw new InvalidStatusChangedEventError('statusAnterior is invalid');
  }

  if (!event.statusNovo || !STATUS_VALUES.has(event.statusNovo)) {
    throw new InvalidStatusChangedEventError('statusNovo is required');
  }

  if (
    !event.destinatario ||
    typeof event.destinatario.nome !== 'string' ||
    typeof event.destinatario.email !== 'string'
  ) {
    throw new InvalidStatusChangedEventError('destinatario is invalid');
  }

  return event as StatusChangedEventV1;
}

export function extractEventFromSqsBody(body: string): unknown {
  const parsed = JSON.parse(body) as { Message?: string };

  if (typeof parsed.Message === 'string') {
    return JSON.parse(parsed.Message);
  }

  return parsed;
}

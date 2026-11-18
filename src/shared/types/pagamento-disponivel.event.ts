import { InvalidNotificationEventError } from './invalid-notification-event.error';

export const PAGAMENTO_DISPONIVEL_EVENT_TYPE =
  'ordem-servico.pagamento-disponivel.v1' as const;

export const PAGAMENTO_DISPONIVEL_EVENT_VERSION = 1 as const;

export interface PagamentoDisponivelEventV1 {
  version: typeof PAGAMENTO_DISPONIVEL_EVENT_VERSION;
  eventId: string;
  eventType: typeof PAGAMENTO_DISPONIVEL_EVENT_TYPE;
  occurredAt: string;
  correlationId: string;
  ordemServicoId: string;
  numeroOs?: number;
  destinatario: {
    nome: string;
    email: string;
  };
  linkPagamento: string;
  prazoPagamento: string;
  valorCentavos: number;
}

// O produtor (OS) envia `numeroOs`, mas o contrato documentado usa `numeroOS`.
// Aceita os dois nomes até o contrato ser alinhado.
type PagamentoDisponivelEventInput = Partial<
  Omit<PagamentoDisponivelEventV1, 'numeroOs'>
> & { numeroOs?: unknown; numeroOS?: unknown };

export function parsePagamentoDisponivelEvent(
  payload: unknown,
): PagamentoDisponivelEventV1 {
  if (!payload || typeof payload !== 'object') {
    throw new InvalidNotificationEventError(
      'O evento de pagamento disponível deve ser um objeto',
    );
  }

  const event = payload as PagamentoDisponivelEventInput;

  if (event.version !== PAGAMENTO_DISPONIVEL_EVENT_VERSION) {
    throw new InvalidNotificationEventError(
      `Versão do evento não suportada: ${String(event.version)}`,
    );
  }

  if (event.eventType !== PAGAMENTO_DISPONIVEL_EVENT_TYPE) {
    throw new InvalidNotificationEventError(
      `Tipo de evento não suportado: ${String(event.eventType)}`,
    );
  }

  assertNonEmptyString(event.eventId, 'eventId');
  assertNonEmptyString(event.correlationId, 'correlationId');
  assertNonEmptyString(event.ordemServicoId, 'ordemServicoId');
  assertNonEmptyString(event.occurredAt, 'occurredAt');

  if (
    !event.destinatario ||
    typeof event.destinatario.nome !== 'string' ||
    typeof event.destinatario.email !== 'string'
  ) {
    throw new InvalidNotificationEventError('destinatario é inválido');
  }

  assertHttpsUrl(event.linkPagamento);
  assertValidDate(event.prazoPagamento);

  if (
    typeof event.valorCentavos !== 'number' ||
    !Number.isInteger(event.valorCentavos) ||
    event.valorCentavos < 0
  ) {
    throw new InvalidNotificationEventError(
      'valorCentavos deve ser um inteiro não negativo',
    );
  }

  const numeroOs = event.numeroOs ?? event.numeroOS;
  if (numeroOs !== undefined && typeof numeroOs !== 'number') {
    throw new InvalidNotificationEventError('numeroOs deve ser numérico');
  }

  return {
    version: event.version,
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    correlationId: event.correlationId,
    ordemServicoId: event.ordemServicoId,
    numeroOs,
    destinatario: event.destinatario,
    linkPagamento: event.linkPagamento,
    prazoPagamento: event.prazoPagamento,
    valorCentavos: event.valorCentavos,
  };
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (!value || typeof value !== 'string') {
    throw new InvalidNotificationEventError(`${field} é obrigatório`);
  }
}

// Só https: o link vai para o e-mail do cliente e não pode ser outro esquema.
function assertHttpsUrl(value: unknown): asserts value is string {
  assertNonEmptyString(value, 'linkPagamento');

  if (!isHttpsUrl(value)) {
    throw new InvalidNotificationEventError(
      'linkPagamento deve ser uma URL https',
    );
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function assertValidDate(value: unknown): asserts value is string {
  assertNonEmptyString(value, 'prazoPagamento');

  if (Number.isNaN(Date.parse(value))) {
    throw new InvalidNotificationEventError(
      'prazoPagamento deve ser uma data ISO 8601',
    );
  }
}

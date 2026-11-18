import { InvalidNotificationEventError } from '../src/shared/types/invalid-notification-event.error';
import {
  extractEventFromSqsBody,
  InvalidStatusChangedEventError,
  parseStatusChangedEvent,
  STATUS_CHANGED_EVENT_TYPE,
  StatusOS,
} from '../src/shared/types/status-changed.event';

const eventoValido = {
  version: 1,
  eventId: 'evt-1',
  eventType: STATUS_CHANGED_EVENT_TYPE,
  occurredAt: '2026-11-15T10:05:00.000Z',
  correlationId: 'corr-1',
  ordemServicoId: 'uuid-os1',
  numeroOS: 42,
  statusAnterior: StatusOS.AGUARDANDO_PAGAMENTO,
  statusNovo: StatusOS.AGUARDANDO_EXECUCAO,
  destinatario: { nome: 'Maria', email: 'maria@email.com' },
};

describe('parseStatusChangedEvent', () => {
  it('aceita o evento completo', () => {
    expect(parseStatusChangedEvent(eventoValido)).toEqual(eventoValido);
  });

  it('aceita statusAnterior nulo, como na abertura da OS', () => {
    const evento = parseStatusChangedEvent({
      ...eventoValido,
      statusAnterior: null,
    });

    expect(evento.statusAnterior).toBeNull();
  });

  it.each(Object.values(StatusOS))('aceita o status %s', (status) => {
    expect(
      parseStatusChangedEvent({ ...eventoValido, statusNovo: status })
        .statusNovo,
    ).toBe(status);
  });

  it.each([
    ['payload nulo', null],
    ['payload que não é objeto', 'texto'],
    ['versão diferente de 1', { ...eventoValido, version: 2 }],
    ['eventType diferente', { ...eventoValido, eventType: 'outro.v1' }],
    ['eventId ausente', { ...eventoValido, eventId: undefined }],
    ['correlationId ausente', { ...eventoValido, correlationId: '' }],
    ['ordemServicoId ausente', { ...eventoValido, ordemServicoId: undefined }],
    ['occurredAt ausente', { ...eventoValido, occurredAt: undefined }],
    ['statusAnterior desconhecido', { ...eventoValido, statusAnterior: 'X' }],
    ['statusAnterior ausente', { ...eventoValido, statusAnterior: undefined }],
    ['statusNovo desconhecido', { ...eventoValido, statusNovo: 'ARQUIVADA' }],
    ['statusNovo ausente', { ...eventoValido, statusNovo: undefined }],
    ['destinatario ausente', { ...eventoValido, destinatario: undefined }],
    [
      'e-mail do destinatario que não é texto',
      { ...eventoValido, destinatario: { nome: 'Maria', email: 1 } },
    ],
  ])('rejeita %s', (_caso, payload) => {
    expect(() => parseStatusChangedEvent(payload)).toThrow(
      InvalidStatusChangedEventError,
    );
  });

  it('o erro de validação é um erro de evento de notificação', () => {
    expect(() => parseStatusChangedEvent(null)).toThrow(
      InvalidNotificationEventError,
    );
  });
});

describe('extractEventFromSqsBody', () => {
  it('devolve o evento que está direto no corpo', () => {
    expect(extractEventFromSqsBody(JSON.stringify(eventoValido))).toEqual(
      eventoValido,
    );
  });

  it('desembrulha o evento da mensagem do SNS', () => {
    const body = JSON.stringify({ Message: JSON.stringify(eventoValido) });

    expect(extractEventFromSqsBody(body)).toEqual(eventoValido);
  });

  it('rejeita corpo que não é JSON', () => {
    expect(() => extractEventFromSqsBody('{quebrado')).toThrow(
      InvalidNotificationEventError,
    );
  });

  it('rejeita Message do SNS que não é JSON', () => {
    expect(() =>
      extractEventFromSqsBody(JSON.stringify({ Message: 'quebrado' })),
    ).toThrow(InvalidNotificationEventError);
  });

  it('devolve valores JSON que não são objeto sem lançar, para o parser rejeitar', () => {
    expect(extractEventFromSqsBody('null')).toBeNull();
    expect(extractEventFromSqsBody('42')).toBe(42);
  });
});

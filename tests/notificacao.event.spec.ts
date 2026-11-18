import {
  extractMessageIdentifiers,
  parseNotificacaoEvent,
} from '../src/shared/types/notificacao.event';
import { InvalidNotificationEventError } from '../src/shared/types/invalid-notification-event.error';
import { PAGAMENTO_DISPONIVEL_EVENT_TYPE } from '../src/shared/types/pagamento-disponivel.event';
import { STATUS_CHANGED_EVENT_TYPE } from '../src/shared/types/status-changed.event';

const envelope = {
  eventId: 'evt-1',
  eventType: STATUS_CHANGED_EVENT_TYPE,
  version: 1,
  occurredAt: '2026-11-15T10:05:00.000Z',
  source: 'os-service',
  correlationId: 'corr-1',
  causationId: null,
  ordemServicoId: 'uuid-os1',
  rodada: 1,
  payload: {
    numeroOS: 7,
    statusAnterior: null,
    statusNovo: 'RECEBIDA',
    destinatario: { nome: 'Maria', email: 'maria@email.com' },
  },
};

const desconhecido = 'desconhecido';

describe('parseNotificacaoEvent', () => {
  it('junta o envelope e o payload num evento de status alterado', () => {
    const evento = parseNotificacaoEvent(JSON.stringify(envelope));

    expect(evento).toEqual(
      expect.objectContaining({
        eventType: STATUS_CHANGED_EVENT_TYPE,
        eventId: 'evt-1',
        correlationId: 'corr-1',
        numeroOS: 7,
        statusNovo: 'RECEBIDA',
      }),
    );
  });

  it('prefere os campos do envelope aos do payload', () => {
    const mensagem = {
      ...envelope,
      payload: { ...envelope.payload, eventId: 'evt-do-payload' },
    };

    expect(
      parseNotificacaoEvent(JSON.stringify(mensagem)).eventId,
    ).toBe('evt-1');
  });

  it('rejeita eventType desconhecido citando o tipo recebido', () => {
    const mensagem = { ...envelope, eventType: 'ordem-servico.outro.v1' };

    expect(() => parseNotificacaoEvent(JSON.stringify(mensagem))).toThrow(
      'ordem-servico.outro.v1',
    );
  });

  it.each([
    ['payload nulo', { ...envelope, payload: null }],
    ['payload textual', { ...envelope, payload: 'texto' }],
  ])('rejeita envelope com %s', (_caso, mensagem) => {
    expect(() => parseNotificacaoEvent(JSON.stringify(mensagem))).toThrow(
      InvalidNotificationEventError,
    );
  });

  it('rejeita corpo que não é objeto', () => {
    expect(() => parseNotificacaoEvent('"texto"')).toThrow(
      InvalidNotificationEventError,
    );
  });
});

describe('extractMessageIdentifiers', () => {
  it('lê os identificadores do envelope', () => {
    expect(extractMessageIdentifiers(JSON.stringify(envelope))).toEqual({
      correlationId: 'corr-1',
      eventId: 'evt-1',
      ordemServicoId: 'uuid-os1',
      eventType: STATUS_CHANGED_EVENT_TYPE,
    });
  });

  it('lê os identificadores de um evento no formato legado', () => {
    const legado = { ...envelope.payload, ...envelope, payload: undefined };

    expect(extractMessageIdentifiers(JSON.stringify(legado))).toEqual(
      expect.objectContaining({
        correlationId: 'corr-1',
        eventType: STATUS_CHANGED_EVENT_TYPE,
      }),
    );
  });

  it('lê os identificadores mesmo de um evento inválido', () => {
    const mensagem = {
      ...envelope,
      eventType: PAGAMENTO_DISPONIVEL_EVENT_TYPE,
      payload: {},
    };

    expect(extractMessageIdentifiers(JSON.stringify(mensagem))).toEqual(
      expect.objectContaining({
        correlationId: 'corr-1',
        eventType: PAGAMENTO_DISPONIVEL_EVENT_TYPE,
      }),
    );
  });

  it('usa o atributo do SNS quando o evento não tem correlationId', () => {
    const body = JSON.stringify({
      Message: JSON.stringify({ ...envelope, correlationId: undefined }),
      MessageAttributes: {
        correlationId: { Type: 'String', Value: 'corr-sns' },
      },
    });

    expect(extractMessageIdentifiers(body).correlationId).toBe('corr-sns');
  });

  it.each([
    ['sem MessageAttributes', {}],
    ['com MessageAttributes que não é objeto', { MessageAttributes: 'x' }],
    [
      'com atributo correlationId que não é objeto',
      { MessageAttributes: { correlationId: 'x' } },
    ],
    [
      'com atributo correlationId sem Value',
      { MessageAttributes: { correlationId: { Type: 'String' } } },
    ],
  ])(
    'registra desconhecido quando o evento e o SNS não trazem correlationId (%s)',
    (_caso, extras) => {
      const body = JSON.stringify({
        Message: JSON.stringify({ ...envelope, correlationId: undefined }),
        ...extras,
      });

      expect(extractMessageIdentifiers(body).correlationId).toBe(desconhecido);
    },
  );

  it.each([
    ['corpo que não é JSON', 'não é json'],
    ['corpo nulo', 'null'],
    ['corpo textual', '"texto"'],
    ['payload inválido', JSON.stringify({ ...envelope, payload: 'x' })],
  ])('devolve tudo desconhecido para %s, sem lançar', (_caso, body) => {
    expect(extractMessageIdentifiers(body)).toEqual({
      correlationId: desconhecido,
      eventId: desconhecido,
      ordemServicoId: desconhecido,
      eventType: desconhecido,
    });
  });
});

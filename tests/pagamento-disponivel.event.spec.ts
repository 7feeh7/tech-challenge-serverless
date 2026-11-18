import {
  PAGAMENTO_DISPONIVEL_EVENT_TYPE,
  parsePagamentoDisponivelEvent,
} from '../src/shared/types/pagamento-disponivel.event';

const eventoValido = {
  version: 1,
  eventId: 'evt-pag-1',
  eventType: PAGAMENTO_DISPONIVEL_EVENT_TYPE,
  occurredAt: '2026-11-15T10:06:30.000Z',
  correlationId: 'corr-pag-1',
  ordemServicoId: 'uuid-os1',
  numeroOs: 1042,
  destinatario: { nome: 'Carlos', email: 'carlos@email.com' },
  linkPagamento: 'https://www.mercadopago.com.br/checkout/pagar/123',
  prazoPagamento: '2026-11-15T10:18:00.000Z',
  valorCentavos: 34500,
};

const semNumeroOs = (): Record<string, unknown> => {
  const evento: Record<string, unknown> = { ...eventoValido };
  delete evento.numeroOs;
  return evento;
};

describe('parsePagamentoDisponivelEvent', () => {
  it('aceita o evento completo', () => {
    expect(parsePagamentoDisponivelEvent(eventoValido)).toEqual(eventoValido);
  });

  it('aceita o evento sem numeroOs', () => {
    expect(
      parsePagamentoDisponivelEvent(semNumeroOs()).numeroOs,
    ).toBeUndefined();
  });

  it('aceita o nome numeroOS do contrato documentado', () => {
    expect(
      parsePagamentoDisponivelEvent({ ...semNumeroOs(), numeroOS: 7 }).numeroOs,
    ).toBe(7);
  });

  it.each([
    ['payload nulo', null],
    ['payload que não é objeto', 'texto'],
    ['versão diferente de 1', { ...eventoValido, version: 2 }],
    ['eventType diferente', { ...eventoValido, eventType: 'outro.v1' }],
    ['eventId ausente', { ...eventoValido, eventId: '' }],
    ['correlationId ausente', { ...eventoValido, correlationId: undefined }],
    ['ordemServicoId ausente', { ...eventoValido, ordemServicoId: undefined }],
    ['occurredAt ausente', { ...eventoValido, occurredAt: undefined }],
    ['destinatario ausente', { ...eventoValido, destinatario: undefined }],
    [
      'nome do destinatario inválido',
      { ...eventoValido, destinatario: { nome: 1, email: 'a@b.com' } },
    ],
    ['linkPagamento ausente', { ...eventoValido, linkPagamento: undefined }],
    [
      'linkPagamento sem https',
      { ...eventoValido, linkPagamento: 'http://pagamento.exemplo.com' },
    ],
    [
      'linkPagamento com outro esquema',
      { ...eventoValido, linkPagamento: 'javascript:alert(1)' },
    ],
    [
      'linkPagamento malformado',
      { ...eventoValido, linkPagamento: 'nao e url' },
    ],
    ['prazoPagamento ausente', { ...eventoValido, prazoPagamento: undefined }],
    [
      'prazoPagamento que não é data',
      { ...eventoValido, prazoPagamento: 'amanhã' },
    ],
    ['valorCentavos ausente', { ...eventoValido, valorCentavos: undefined }],
    ['valorCentavos negativo', { ...eventoValido, valorCentavos: -1 }],
    ['valorCentavos fracionado', { ...eventoValido, valorCentavos: 10.5 }],
    ['valorCentavos textual', { ...eventoValido, valorCentavos: '100' }],
    ['numeroOs que não é número', { ...eventoValido, numeroOs: '1042' }],
  ])('rejeita %s', (_caso, payload) => {
    expect(() => parsePagamentoDisponivelEvent(payload)).toThrow();
  });
});

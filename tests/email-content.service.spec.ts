import {
  buildNotificacaoEmail,
  buildPagamentoDisponivelEmail,
  buildStatusChangedEmail,
} from '../src/shared/services/email-content.service';
import {
  PAGAMENTO_DISPONIVEL_EVENT_TYPE,
  PAGAMENTO_DISPONIVEL_EVENT_VERSION,
  PagamentoDisponivelEventV1,
} from '../src/shared/types/pagamento-disponivel.event';
import {
  STATUS_CHANGED_EVENT_TYPE,
  STATUS_CHANGED_EVENT_VERSION,
  StatusOS,
} from '../src/shared/types/status-changed.event';

describe('buildStatusChangedEmail', () => {
  it('builds subject and body from status transition', () => {
    const email = buildStatusChangedEmail({
      version: STATUS_CHANGED_EVENT_VERSION,
      eventId: 'evt-1',
      eventType: STATUS_CHANGED_EVENT_TYPE,
      occurredAt: '2026-09-13T12:00:00.000Z',
      correlationId: 'corr-1',
      ordemServicoId: 'uuid-os1',
      numeroOS: 10,
      statusAnterior: StatusOS.AGUARDANDO_APROVACAO,
      statusNovo: StatusOS.EM_EXECUCAO,
      destinatario: { nome: 'Maria', email: 'maria@email.com' },
    });

    expect(email.subject).toBe('OS #10: Em execução');
    expect(email.text).toContain('Maria');
    expect(email.text).toContain('Aguardando aprovação do orçamento');
    expect(email.to).toBe('maria@email.com');
  });
});

describe('buildStatusChangedEmail sem número da OS', () => {
  it('identifica a OS genericamente e omite o status anterior na abertura', () => {
    const email = buildStatusChangedEmail({
      version: STATUS_CHANGED_EVENT_VERSION,
      eventId: 'evt-1',
      eventType: STATUS_CHANGED_EVENT_TYPE,
      occurredAt: '2026-11-15T10:00:00.000Z',
      correlationId: 'corr-1',
      ordemServicoId: 'uuid-os1',
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
      destinatario: { nome: 'Maria', email: 'maria@email.com' },
    });

    expect(email.subject).toBe('sua ordem de serviço: Recebida');
    expect(email.text).not.toContain('Status anterior');
    expect(email.html).not.toContain('Status anterior');
  });
});

describe('buildStatusChangedEmail com status da Fase 4', () => {
  it.each([
    [StatusOS.AGUARDANDO_PAGAMENTO, 'Aguardando pagamento'],
    [StatusOS.AGUARDANDO_EXECUCAO, 'Aguardando execução'],
    [StatusOS.EM_CANCELAMENTO, 'Em cancelamento'],
    [StatusOS.CANCELADA, 'Cancelada'],
  ])('descreve o status %s', (statusNovo, descricao) => {
    const email = buildStatusChangedEmail({
      version: STATUS_CHANGED_EVENT_VERSION,
      eventId: 'evt-1',
      eventType: STATUS_CHANGED_EVENT_TYPE,
      occurredAt: '2026-11-15T10:00:00.000Z',
      correlationId: 'corr-1',
      ordemServicoId: 'uuid-os1',
      numeroOS: 10,
      statusAnterior: null,
      statusNovo,
      destinatario: { nome: 'Maria', email: 'maria@email.com' },
    });

    expect(email.subject).toBe(`OS #10: ${descricao}`);
  });
});

describe('buildPagamentoDisponivelEmail', () => {
  const eventoPagamento: PagamentoDisponivelEventV1 = {
    version: PAGAMENTO_DISPONIVEL_EVENT_VERSION,
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

  it('monta assunto, valor, prazo e link de pagamento', () => {
    const email = buildPagamentoDisponivelEmail(eventoPagamento);

    expect(email.to).toBe('carlos@email.com');
    expect(email.subject).toBe('OS #1042: pagamento disponível');
    expect(email.text.replace(/ /g, ' ')).toContain('Valor: R$ 345,00.');
    expect(email.text).toContain(
      'Pague até 15/11/2026 às 07:18 (horário de Brasília).',
    );
    expect(email.text).toContain(
      'Link de pagamento: https://www.mercadopago.com.br/checkout/pagar/123',
    );
    expect(email.html).toContain(
      '<a href="https://www.mercadopago.com.br/checkout/pagar/123">',
    );
  });

  it('identifica a OS genericamente quando o número não vem no evento', () => {
    const email = buildPagamentoDisponivelEmail({
      ...eventoPagamento,
      numeroOs: undefined,
    });

    expect(email.subject).toBe('sua ordem de serviço: pagamento disponível');
  });

  it('escapa HTML no nome e no link', () => {
    const email = buildPagamentoDisponivelEmail({
      ...eventoPagamento,
      destinatario: { nome: '<b>Carlos</b> & Cia', email: 'carlos@email.com' },
      linkPagamento: 'https://pagamento.exemplo.com/?a=1&b="2"',
    });

    expect(email.html).toContain('&lt;b&gt;Carlos&lt;/b&gt; &amp; Cia');
    expect(email.html).toContain(
      'href="https://pagamento.exemplo.com/?a=1&amp;b=&quot;2&quot;"',
    );
    expect(email.html).not.toContain('<b>Carlos</b>');
  });
});

describe('buildNotificacaoEmail', () => {
  it('escolhe o template pelo eventType', () => {
    const statusChanged = buildNotificacaoEmail({
      version: STATUS_CHANGED_EVENT_VERSION,
      eventId: 'evt-1',
      eventType: STATUS_CHANGED_EVENT_TYPE,
      occurredAt: '2026-11-15T10:00:00.000Z',
      correlationId: 'corr-1',
      ordemServicoId: 'uuid-os1',
      numeroOS: 10,
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
      destinatario: { nome: 'Maria', email: 'maria@email.com' },
    });
    const pagamento = buildNotificacaoEmail({
      version: PAGAMENTO_DISPONIVEL_EVENT_VERSION,
      eventId: 'evt-pag-1',
      eventType: PAGAMENTO_DISPONIVEL_EVENT_TYPE,
      occurredAt: '2026-11-15T10:06:30.000Z',
      correlationId: 'corr-pag-1',
      ordemServicoId: 'uuid-os1',
      destinatario: { nome: 'Carlos', email: 'carlos@email.com' },
      linkPagamento: 'https://pagamento.exemplo.com/123',
      prazoPagamento: '2026-11-15T10:18:00.000Z',
      valorCentavos: 100,
    });

    expect(statusChanged.subject).toBe('OS #10: Recebida');
    expect(pagamento.subject).toBe(
      'sua ordem de serviço: pagamento disponível',
    );
  });
});

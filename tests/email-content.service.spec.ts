import { buildStatusChangedEmail } from '../src/shared/services/email-content.service';
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

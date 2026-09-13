import {
  NotificacaoService,
  PermanentNotificationError,
  TransientNotificationError,
} from '../src/functions/notificacao/notificacao.service';
import { EmailSender } from '../src/shared/adapters/sendgrid.adapter';
import { resetDedupeCache } from '../src/shared/services/dedupe.service';
import {
  STATUS_CHANGED_EVENT_TYPE,
  STATUS_CHANGED_EVENT_VERSION,
  StatusOS,
} from '../src/shared/types/status-changed.event';

const evento = {
  version: STATUS_CHANGED_EVENT_VERSION,
  eventId: 'evt-1',
  eventType: STATUS_CHANGED_EVENT_TYPE,
  occurredAt: '2026-09-13T12:00:00.000Z',
  correlationId: 'corr-1',
  ordemServicoId: 'uuid-os1',
  numeroOS: 42,
  statusAnterior: StatusOS.RECEBIDA,
  statusNovo: StatusOS.EM_DIAGNOSTICO,
  destinatario: { nome: 'João', email: 'joao@email.com' },
};

const criarSenderMock = (): jest.Mocked<EmailSender> => ({
  send: jest.fn().mockResolvedValue(undefined),
});

describe('NotificacaoService', () => {
  beforeEach(() => {
    resetDedupeCache();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends email for a valid SNS-wrapped event', async () => {
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');
    const body = JSON.stringify({
      Type: 'Notification',
      Message: JSON.stringify(evento),
    });

    await service.processRecord(body);

    expect(sender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'joao@email.com',
        from: 'oficina@oficina.com',
        subject: 'OS #42: Em diagnóstico',
      }),
    );
  });

  it('deduplicates events by eventId on redelivery', async () => {
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');
    const body = JSON.stringify(evento);

    await service.processRecord(body);
    await service.processRecord(body);

    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('classifies invalid payload as permanent failure', async () => {
    const sender = criarSenderMock();
    const service = new NotificacaoService(sender, 'oficina@oficina.com');

    await expect(
      service.processRecord(JSON.stringify({ version: 2 })),
    ).rejects.toThrow(PermanentNotificationError);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('retries transient SendGrid failures', async () => {
    const sender = criarSenderMock();
    sender.send.mockRejectedValue(new Error('SendGrid 503'));
    const service = new NotificacaoService(sender, 'oficina@oficina.com');

    await expect(
      service.processRecord(JSON.stringify(evento)),
    ).rejects.toThrow(TransientNotificationError);
  });
});

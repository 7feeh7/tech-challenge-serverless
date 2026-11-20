import { Resend } from 'resend';
import { logIntegrationMetric } from '../services/integration-metrics.service';

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class ResendEmailSender implements EmailSender {
  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    const startedAt = Date.now();

    try {
      await this.sendOrThrow(message);
    } catch (error) {
      this.logMetric('failure', startedAt);
      throw error;
    }

    this.logMetric('success', startedAt);
  }

  // O SDK do Resend devolve { data, error } em vez de lançar exceção para
  // erros da API. Sem esta verificação, uma recusa seria tratada como envio
  // bem-sucedido e a mensagem sairia da fila sem retentativa.
  private async sendOrThrow(message: EmailMessage): Promise<void> {
    const { data, error } = await this.resend.emails.send({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      // A mensagem do Resend é omitida: pode ecoar o destinatário.
      throw new Error(
        `Resend recusou o envio: ${error.name} (statusCode ${error.statusCode ?? 'indisponível'})`,
      );
    }

    if (!data?.id) {
      throw new Error('Resend respondeu sem identificador do e-mail');
    }
  }

  private logMetric(result: 'success' | 'failure', startedAt: number): void {
    logIntegrationMetric({
      integration: 'resend',
      result,
      durationMs: Date.now() - startedAt,
    });
  }
}

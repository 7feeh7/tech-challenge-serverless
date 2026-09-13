import { StatusChangedEventV1, StatusOS } from '../types/status-changed.event';

const DESCRICAO_DO_STATUS: Record<StatusOS, string> = {
  [StatusOS.RECEBIDA]: 'Recebida',
  [StatusOS.EM_DIAGNOSTICO]: 'Em diagnóstico',
  [StatusOS.AGUARDANDO_APROVACAO]: 'Aguardando aprovação do orçamento',
  [StatusOS.EM_EXECUCAO]: 'Em execução',
  [StatusOS.FINALIZADA]: 'Finalizada',
  [StatusOS.ENTREGUE]: 'Entregue',
};

export interface EmailContent {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function buildStatusChangedEmail(event: StatusChangedEventV1): EmailContent {
  const identificacao = event.numeroOS
    ? `OS #${event.numeroOS}`
    : 'sua ordem de serviço';
  const statusNovo = DESCRICAO_DO_STATUS[event.statusNovo];
  const statusAnterior = event.statusAnterior
    ? DESCRICAO_DO_STATUS[event.statusAnterior]
    : null;

  const subject = `${identificacao}: ${statusNovo}`;
  const textLines = [
    `Olá, ${event.destinatario.nome}.`,
    '',
    `A ${identificacao} está agora com o status: ${statusNovo}.`,
  ];

  if (statusAnterior) {
    textLines.push(`Status anterior: ${statusAnterior}.`);
  }

  textLines.push('', 'Oficina Mecânica');

  const htmlParts = [
    `<p>Olá, ${event.destinatario.nome}.</p>`,
    `<p>A <strong>${identificacao}</strong> está agora com o status: <strong>${statusNovo}</strong>.</p>`,
  ];

  if (statusAnterior) {
    htmlParts.push(`<p>Status anterior: ${statusAnterior}</p>`);
  }

  htmlParts.push('<p>Oficina Mecânica</p>');

  return {
    to: event.destinatario.email,
    subject,
    text: textLines.join('\n'),
    html: htmlParts.join(''),
  };
}

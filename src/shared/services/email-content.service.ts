import { NotificacaoEvent } from '../types/notificacao.event';
import {
  PAGAMENTO_DISPONIVEL_EVENT_TYPE,
  PagamentoDisponivelEventV1,
} from '../types/pagamento-disponivel.event';
import { StatusChangedEventV1, StatusOS } from '../types/status-changed.event';

const FUSO_HORARIO_OFICINA = 'America/Sao_Paulo';

const DESCRICAO_DO_STATUS: Record<StatusOS, string> = {
  [StatusOS.RECEBIDA]: 'Recebida',
  [StatusOS.EM_DIAGNOSTICO]: 'Em diagnóstico',
  [StatusOS.AGUARDANDO_APROVACAO]: 'Aguardando aprovação do orçamento',
  [StatusOS.AGUARDANDO_PAGAMENTO]: 'Aguardando pagamento',
  [StatusOS.AGUARDANDO_EXECUCAO]: 'Aguardando execução',
  [StatusOS.EM_EXECUCAO]: 'Em execução',
  [StatusOS.EM_CANCELAMENTO]: 'Em cancelamento',
  [StatusOS.FINALIZADA]: 'Finalizada',
  [StatusOS.CANCELADA]: 'Cancelada',
  [StatusOS.ENTREGUE]: 'Entregue',
};

export interface EmailContent {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function buildNotificacaoEmail(event: NotificacaoEvent): EmailContent {
  if (event.eventType === PAGAMENTO_DISPONIVEL_EVENT_TYPE) {
    return buildPagamentoDisponivelEmail(event);
  }

  return buildStatusChangedEmail(event);
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

export function buildPagamentoDisponivelEmail(
  event: PagamentoDisponivelEventV1,
): EmailContent {
  const identificacao = event.numeroOs
    ? `OS #${event.numeroOs}`
    : 'sua ordem de serviço';
  const valor = formatarValor(event.valorCentavos);
  const prazo = formatarPrazo(event.prazoPagamento);

  const textLines = [
    `Olá, ${event.destinatario.nome}.`,
    '',
    `O pagamento da ${identificacao} está disponível.`,
    `Valor: ${valor}.`,
    `Pague até ${prazo}.`,
    `Link de pagamento: ${event.linkPagamento}`,
    '',
    'Oficina Mecânica',
  ];

  const htmlParts = [
    `<p>Olá, ${escaparHtml(event.destinatario.nome)}.</p>`,
    `<p>O pagamento da <strong>${identificacao}</strong> está disponível.</p>`,
    `<p>Valor: <strong>${valor}</strong>.</p>`,
    `<p>Pague até ${prazo}.</p>`,
    `<p><a href="${escaparHtml(event.linkPagamento)}">Pagar agora</a></p>`,
    '<p>Oficina Mecânica</p>',
  ];

  return {
    to: event.destinatario.email,
    subject: `${identificacao}: pagamento disponível`,
    text: textLines.join('\n'),
    html: htmlParts.join(''),
  };
}

function formatarValor(valorCentavos: number): string {
  return (valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatarPrazo(prazoPagamento: string): string {
  const prazo = new Date(prazoPagamento);
  const data = prazo.toLocaleDateString('pt-BR', {
    timeZone: FUSO_HORARIO_OFICINA,
  });
  const hora = prazo.toLocaleTimeString('pt-BR', {
    timeZone: FUSO_HORARIO_OFICINA,
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${data} às ${hora} (horário de Brasília)`;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

# Contrato — eventos de notificação

## Fluxo

`OS Service → outbox → SNS → SQS → Lambda notificacao → SendGrid`

A Lambda despacha pelo `eventType` e aceita dois eventos:

| `eventType` | Quando | E-mail enviado |
| --- | --- | --- |
| `ordem-servico.status-changed.v1` | Toda mudança de status da OS | Status novo (e anterior, quando houver) |
| `ordem-servico.pagamento-disponivel.v1` | Cobrança criada no Billing e link de pagamento disponível | Valor, prazo e link de pagamento |

Qualquer outro `eventType` é erro permanente (ver [Falhas e DLQ](#falhas-e-dlq)).

## Formatos aceitos

- **Envelope da Fase 4:** `eventId`, `eventType`, `version`, `occurredAt`, `source`, `correlationId`, `causationId`, `ordemServicoId` e `rodada` na raiz; os dados do evento em `payload`. É o que o OS Service publica.
- **Formato legado (Fase 3):** os campos do evento direto na raiz, sem `payload`. Continua aceito para que a Lambda possa ser implantada antes do novo OS (D2.9, passo 1).

O SNS entrega o evento no campo `Message` do corpo da mensagem SQS; a Lambda também aceita o evento direto no corpo.

## Evento `ordem-servico.status-changed.v1`

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `version` | `1` | sim | Versão do contrato |
| `eventId` | UUID | sim | Idempotência e deduplicação |
| `eventType` | string | sim | Sempre `ordem-servico.status-changed.v1` |
| `occurredAt` | ISO-8601 | sim | Momento da transição confirmada |
| `correlationId` | string | sim | Correlação com a requisição HTTP |
| `ordemServicoId` | UUID | sim | Identificador da OS |
| `numeroOS` | number | não | Número amigável exibido ao cliente |
| `statusAnterior` | enum ou `null` | sim | Status antes da transição |
| `statusNovo` | enum | sim | Status após a transição |
| `destinatario.nome` | string | sim | Nome do cliente |
| `destinatario.email` | string | sim | E-mail do destinatário |

Status aceitos: `RECEBIDA`, `EM_DIAGNOSTICO`, `AGUARDANDO_APROVACAO`, `AGUARDANDO_PAGAMENTO`, `AGUARDANDO_EXECUCAO`, `EM_EXECUCAO`, `EM_CANCELAMENTO`, `FINALIZADA`, `CANCELADA`, `ENTREGUE`. Status fora dessa lista tornam o evento inválido.

No envelope da Fase 4, `numeroOS`, `statusAnterior`, `statusNovo` e `destinatario` ficam em `payload`.

## Evento `ordem-servico.pagamento-disponivel.v1`

Os campos abaixo ficam em `payload`; os demais são os do envelope.

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `destinatario.nome` | string | sim | Nome do cliente |
| `destinatario.email` | string | sim | E-mail do destinatário |
| `numeroOs` | number | não | Número amigável da OS (o OS envia `numeroOs`; a Lambda também lê `numeroOS`) |
| `linkPagamento` | string | sim | URL `https` do pagamento |
| `prazoPagamento` | ISO-8601 | sim | Prazo para pagar, exibido no horário de Brasília |
| `valorCentavos` | inteiro >= 0 | sim | Valor em centavos, exibido em reais |

## Compatibilidade

- Consumidores aceitam apenas `version = 1`.
- Versões futuras devem introduzir novo `eventType` (`*.v2`) em paralelo.

## Transições que publicam evento

- Mudança de status da OS via `PATCH /v1/ordens-servico/:id`.
- Decisões de orçamento que movem a OS (criar, aprovar, rejeitar).
- No-op (mesmo status) **não** publica evento.

## Deduplicação

- Chave: `eventId`.
- Reentrega com mesmo `eventId` é ignorada pelo consumidor (log `deduplicado`).

## Falhas e DLQ

A Lambda responde com `batchItemFailures` (o *event source mapping* usa `ReportBatchItemFailures`). Todo item que falha volta à fila e, ao atingir o `maxReceiveCount`, vai para a DLQ.

| Situação | Resultado no log | Vai para a DLQ |
| --- | --- | --- |
| JSON inválido, `eventType` desconhecido, versão não suportada, payload incompleto ou inválido | `invalido` (`notificacao_status_permanente`) | Sim, depois das tentativas |
| Falha ao enviar o e-mail (SendGrid) | `erro_transiente` (`notificacao_status_retry`) | Só se persistir |
| Destinatário sem e-mail | `sem_email` | Não: o item é confirmado e o motivo fica no log |
| Evento repetido (mesmo `eventId`) | `deduplicado` | Não |

Nenhum item é descartado em silêncio: todo resultado gera log.

## Logs e `correlationId`

Todo processamento registra `correlationId`, `eventId`, `eventType`, `ordemServicoId` e `resultado`, inclusive nos erros. Quando o evento é inválido, os identificadores são lidos do que for possível no corpo; na ausência do `correlationId` no evento, a Lambda usa o atributo `correlationId` da mensagem SNS; sem nenhum dos dois, registra `desconhecido`.

## Dados sensíveis

- O evento de status **não** transporta token, CPF ou segredos. O de pagamento carrega o link de pagamento, que não é registrado em log.
- Logs mascaram e-mail parcialmente quando aplicável.

## DLQ e reprocessamento

1. Inspecione mensagens na DLQ via console SQS ou CLI.
2. Corrija a causa raiz (payload inválido, secret SendGrid, etc.). Procure pelo `correlationId` nos logs da Lambda para localizar o processamento.
3. Reenvie manualmente para a fila principal **somente** após correção.
4. Não reencaminhe mensagens permanentemente inválidas — evita loop infinito.
5. Prefira republicar um novo evento pela API quando a transação de negócio puder ser repetida de forma segura.

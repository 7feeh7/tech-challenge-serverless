# Contrato — evento de mudança de status

## Fluxo

`API → SNS → SQS → Lambda notificacao → SendGrid`

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

## Compatibilidade

- Consumidores aceitam apenas `version = 1`.
- Versões futuras devem introduzir novo `eventType` (`*.v2`) em paralelo.
- Mensagens inválidas são descartadas sem retry infinito e podem ir para DLQ após `maxReceiveCount`.

## Transições que publicam evento

- Mudança de status da OS via `PATCH /v1/ordens-servico/:id`.
- Decisões de orçamento que movem a OS (criar, aprovar, rejeitar).
- No-op (mesmo status) **não** publica evento.

## Deduplicação

- Chave: `eventId`.
- Reentrega com mesmo `eventId` é ignorada pelo consumidor (log `deduplicado`).

## Dados sensíveis

- O evento **não** transporta token, CPF ou segredos.
- Logs mascaram e-mail parcialmente quando aplicável.

## DLQ e reprocessamento

1. Inspecione mensagens na DLQ via console SQS ou CLI.
2. Corrija a causa raiz (payload inválido, secret SendGrid, etc.).
3. Reenvie manualmente para a fila principal **somente** após correção.
4. Não reencaminhe mensagens permanentemente inválidas — evita loop infinito.
5. Prefira republicar um novo evento pela API quando a transação de negócio puder ser repetida de forma segura.

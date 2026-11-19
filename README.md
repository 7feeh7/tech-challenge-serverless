# tech-challenge-serverless

Functions AWS Lambda da oficina: autenticação de clientes por CPF (consulta HTTP ao OS e token RS256) e notificação de status de ordem de serviço.

## Propósito e limites

| Dentro deste repo | Fora deste repo |
| --- | --- |
| Código TypeScript das Functions `auth-cpf` e `notificacao` | Shell IAM/VPC/S3 das Lambdas → `tech-challenge-infra-kubernetes` |
| Build ZIP + upload S3 + update-function-code | API Gateway, filas, RDS → infra |
| Testes unitários e contratos em `docs/` | Schema Prisma e migrations → `tech-challenge-oficina` |

## Tecnologias

| Tecnologia | Versão |
| --- | --- |
| Node.js | 20+ |
| TypeScript | 5.7 |
| esbuild | 0.24 |
| jsonwebtoken | 9 |
| Jest | 29 |

## Dockerfile

**Não aplicável.** Deploy via artefato ZIP (`{commit_sha}.zip`) no S3; runtime é Node.js gerenciado pela AWS Lambda, não container.

## Arquitetura (este repositório)

```mermaid
flowchart LR
    GW[API Gateway /auth/cpf] --> AUTH[Lambda auth-cpf]
    SQS[SQS notificacao] --> NOTIF[Lambda notificacao]
    AUTH -->|HTTP interno via NLB| OS[OS Service]
    NOTIF --> SG[Resend]
```

Visão completa: [diagrama componentes](https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/diagramas/componentes-nuvem.md) · Sequência auth: [sequencia-auth-cpf](https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/diagramas/sequencia-auth-cpf.md) · RFCs/ADRs: [rfcs](https://github.com/7feeh7/tech-challenge-oficina/tree/main/docs/rfcs), [adrs](https://github.com/7feeh7/tech-challenge-oficina/tree/main/docs/adrs)

## Functions

| Function | Trigger | Descricao |
| --- | --- | --- |
| `auth-cpf` | API Gateway `POST /auth/cpf` | Valida CPF, consulta o cliente no OS por HTTP interno e emite JWT RS256 |
| `notificacao` | SQS (spec 004) | Envia e-mail de mudanca de status e de pagamento disponivel; item invalido vai para a DLQ (`batchItemFailures`). Contrato: [docs/contrato-evento-notificacao.md](docs/contrato-evento-notificacao.md) |

Codigo provisionado (shell/IAM/VPC) em `tech-challenge-infra-kubernetes`. Este repositorio e a **fonte de verdade** do codigo das Functions.

## Estrutura

```text
src/
  functions/
    auth-cpf/handler.ts
    notificacao/handler.ts
  shared/
    adapters/     api-gateway, os-cliente (HTTP ao OS), resend
    services/     jwt, secrets, logs e metricas
    validators/   cpf
    types/
tests/
.github/workflows/
```

## Pre-requisitos

- Node.js 20+
- npm 10+
- Infra kubernetes deployada (SSM + Lambda shell + bucket S3)

## Desenvolvimento local

```bash
npm ci
npm run lint
npm run type-check
npm test
npm run build
```

## Integracao cross-repo

Prefixo unico: `/tech-challenge/producao/`

| Parametro SSM | Uso |
| --- | --- |
| `infra/lambda_artifacts_bucket` | Upload ZIP `{sha}.zip` |
| `infra/lambda_auth_function_name` | Deploy auth-cpf |
| `infra/lambda_notificacao_function_name` | Deploy notificacao |

## GitHub Secrets (Environment `producao`)

| Secret | Uso |
| --- | --- |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Upload S3 + update Lambda |

## Branches e pipelines

| Branch | Workflow | Toca AWS |
| --- | --- | --- |
| `develop` | `pr-validation.yml` | **nao** |
| `main` | `deploy.yml` | **sim** |

Artefatos usam tag imutavel `{commit_sha}.zip`; `latest.zip` e alias secundario.

## Auditoria de dependencias

O `pr-validation.yml` roda `npx audit-ci --config audit-ci.jsonc`: falha para qualquer vulnerabilidade `high` ou `critical`, em producao e desenvolvimento, exceto os advisories listados em `audit-ci.jsonc`.

Excecao vigente: `GHSA-fc5q-39xc-vjpf` (`picomatch <=4.0.7`, ReDoS em extglobs). Nao ha versao corrigida publicada e a cadeia e so de desenvolvimento (jest, ts-jest, eslint); nao entra no bundle das Lambdas. **Condicao de remocao:** quando sair um `picomatch` corrigido, atualize a dependencia (ou use `overrides`, como no commit `95c6f7c`), remova a entrada da `allowlist` e confirme `npx audit-ci --config audit-ci.jsonc`. Para auditar so producao: `npm audit --omit=dev --audit-level=high`.

## Rollback

1. Identifique a versao anterior no S3 (`lambda-auth-cpf/{sha-anterior}.zip`).
2. Execute `aws lambda update-function-code` apontando para o ZIP desejado.
3. Ou reverta o commit e faca merge na branch alvo.

Detalhes funcionais das Functions: specs `002` (auth) e `004` (notificacao).

## Repositórios relacionados

| Repositório | URL | Papel |
| --- | --- | --- |
| tech-challenge-oficina | https://github.com/7feeh7/tech-challenge-oficina | API NestJS, docs centrais, Swagger `/docs` |
| tech-challenge-infra-kubernetes | https://github.com/7feeh7/tech-challenge-infra-kubernetes | Provisiona Lambdas (shell), Gateway, SSM |
| tech-challenge-infra-database | https://github.com/7feeh7/tech-challenge-infra-database | RDS do OS e do Billing (a auth-cpf não acessa banco: D0.4) |

**Ordem de deploy:** infra-kubernetes (1º) → infra-database (2º) → **este repo** (3º) → aplicação (4º).

## Swagger / OpenAPI

**Não aplicável neste repositório** (sem API HTTP própria). Contratos:

- Auth: [`docs/contrato-auth-cpf.md`](docs/contrato-auth-cpf.md) — endpoint público `POST /auth/cpf` no Gateway
- API de negócio: [OpenAPI da aplicação](https://github.com/7feeh7/tech-challenge-oficina/blob/main/docs/openapi.json) · runtime `{api_gateway_url}/docs`

## Deploy ativo

Após merge em `main`, o workflow publica ZIP no bucket SSM `infra/lambda_artifacts_bucket` e atualiza as Functions. Endpoint de auth: `{api_gateway_url}/auth/cpf` (SSM `api_gateway_auth_url`).

## Contrato `POST /auth/cpf`

Documentacao completa em [docs/contrato-auth-cpf.md](docs/contrato-auth-cpf.md).

Resumo:

- Body: `{ "cpf": "000.000.000-00" }`
- Sucesso: `{ "accessToken", "tokenType": "Bearer", "expiresIn" }`
- Erros: `400` (body/CPF), `401` (nao autorizado), `500`
- JWT: `sub`, `tipo`, `perfil`, `iss`, `aud`, `iat`, `exp`, `jti` — sem PII
- Sem refresh token

### Variaveis de ambiente da `auth-cpf`

| Variavel | Descricao |
| --- | --- |
| `OS_SERVICE_BASE_URL` | URL base do OS alcancada pela Lambda (NLB interno), sem barra final obrigatoria. **Nova** |
| `AUTH_CPF_OS_TOKEN_ARN` | ARN do segredo `token-auth-cpf-os` (campo `token`), enviado ao OS como `Authorization: Bearer` |
| `JWT_SECRET_ARN` | ARN do segredo da chave **privada** RS256 (campo `privateKey`; nome legado mantido). Antes guardava o segredo HS256 (campo `secret`) |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Claims `iss` e `aud` (padroes `tech-challenge-auth` e `tech-challenge-api`) |
| `JWT_EXPIRES_IN` | Expiracao do token (padrao `1h`) |
| `AUTH_RATE_LIMIT_TABLE`, `AUTH_CPF_MAX_ATTEMPTS`, `AUTH_CPF_WINDOW_SECONDS` | Limite de tentativas por CPF (DynamoDB) |
| `AUTH_RESPONSE_TARGET_MS` | Tempo minimo uniforme de resposta |

Removidas: `DB_SECRET_ARN` (a Lambda nao acessa banco, D0.4) e `JWT_SECRET` (HS256, fallback local). Detalhes do fluxo de tokens e da rota do OS em [docs/contrato-auth-cpf.md](docs/contrato-auth-cpf.md).

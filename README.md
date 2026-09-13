# tech-challenge-serverless

Functions AWS Lambda da oficina: autenticacao de clientes por CPF e notificacao de status de ordem de servico.

## Functions

| Function | Trigger | Descricao |
| --- | --- | --- |
| `auth-cpf` | API Gateway `POST /auth/cpf` | Valida CPF, busca cliente no PostgreSQL e emite JWT |
| `notificacao` | SQS (spec 004) | Envia e-mail de mudanca de status |

Codigo provisionado (shell/IAM/VPC) em `tech-challenge-infra-kubernetes`. Este repositorio e a **fonte de verdade** do codigo das Functions.

## Estrutura

```text
src/
  functions/
    auth-cpf/handler.ts
    notificacao/handler.ts
  shared/
    services/     database (PostgreSQL), jwt
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
| `database/db_secret_arn` | Runtime da auth-cpf |

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

## Rollback

1. Identifique a versao anterior no S3 (`lambda-auth-cpf/{sha-anterior}.zip`).
2. Execute `aws lambda update-function-code` apontando para o ZIP desejado.
3. Ou reverta o commit e faca merge na branch alvo.

Detalhes funcionais das Functions: specs `002` (auth) e `004` (notificacao).

## Contrato `POST /auth/cpf`

Documentacao completa em [docs/contrato-auth-cpf.md](docs/contrato-auth-cpf.md).

Resumo:

- Body: `{ "cpf": "000.000.000-00" }`
- Sucesso: `{ "accessToken", "tokenType": "Bearer", "expiresIn" }`
- Erros: `400` (body/CPF), `401` (nao autorizado), `500`
- JWT: `sub`, `tipo`, `perfil`, `iss`, `aud`, `iat`, `exp`, `jti` — sem PII
- Sem refresh token

### Variaveis locais

| Variavel | Descricao |
| --- | --- |
| `JWT_SECRET` | Segredo local (nunca igual ao provisionado) |
| `DB_SECRET_ARN` | Credenciais RDS |
| `JWT_ISSUER` / `JWT_AUDIENCE` | Claims padrao |

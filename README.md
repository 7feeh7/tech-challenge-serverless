# tech-challenge-serverless

Funções AWS Lambda da oficina mecânica: autenticação de clientes por CPF (`auth-cpf`) e notificação de mudanças da ordem de serviço por e-mail (`notificacao`). Projeto do Tech Challenge (FIAP).

Na **Fase 4** a `auth-cpf` não acessa mais o banco: consulta o OS Service por uma rota interna. A `notificacao` consome a fila alimentada pelo SNS do OS. Nenhuma das duas participa da orquestração da SAGA.

## Tecnologias

| Tecnologia                 | Uso                                       |
| -------------------------- | ----------------------------------------- |
| Node.js 20+                | Runtime Lambda gerenciado (sem contêiner) |
| TypeScript 5.7             | Linguagem                                 |
| esbuild                    | Bundle de cada função                     |
| Jest 29 + ESLint           | Testes e lint                             |
| jsonwebtoken               | Emissão do JWT RS256                      |
| Resend                     | Envio de e-mail                           |
| DynamoDB / Secrets Manager | Rate limit por CPF e segredos             |

## Arquitetura

| Função        | Gatilho                       | Responsabilidade                                                                                   |
| ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `auth-cpf`    | API Gateway `POST /auth/cpf`  | Valida o CPF, aplica rate limit por CPF no DynamoDB, consulta o cliente no OS e emite um JWT RS256 |
| `notificacao` | Fila SQS `notificacao-status` | Envia o e-mail de mudança de status e de pagamento disponível; item inválido vai para a DLQ        |

- **auth-cpf:** o rate limit padrão é de 5 tentativas por CPF em 300 s. A consulta ao OS usa `GET /internal/clientes?cpf=`, rota interna que não passa pelo API Gateway, com token de serviço lido do Secrets Manager. O JWT é RS256, de 1 h, assinado com a chave privada do Secrets Manager, com perfil CLIENTE e sem dados pessoais. Não há refresh token.
- **notificacao:** recebe os eventos `ordem-servico.status-changed.v1` e `ordem-servico.pagamento-disponivel.v1`, publicados pelo OS no tópico SNS `notificacao-status`. A fila e a DLQ pertencem ao `tech-challenge-infra-kubernetes`.
- **Infraestrutura:** o recurso de cada Lambda (IAM, rede, trigger) é provisionado no `tech-challenge-infra-kubernetes`. Este repositório é a fonte do código e publica o ZIP.
- **Banco:** nenhum. O OS é o dono dos dados de cliente.
- **Observabilidade:** logs estruturados sem PII (CPF e e-mail mascarados) e métricas de integração e de autenticação.

## Execução e desenvolvimento

Pré-requisitos: Node.js 20+ e npm 10+. Não há Dockerfile nem execução local das Lambdas; o desenvolvimento é feito por testes.

```bash
npm ci
npm run lint
npm run type-check
npm test
npm run test:cov
npm run build
```

O `build` gera `dist/auth-cpf/handler.js` e `dist/notificacao/handler.js`.

Pipelines:

- `develop` e PR (`pr-validation.yml`): `npm ci`, lint, type-check, cobertura, `audit-ci` e build, sem tocar a AWS.
- `main` (`deploy.yml`): roda lint, type-check, cobertura e build, empacota os ZIPs e atualiza as funções. O ZIP da `auth-cpf` vai ao bucket S3 de artefatos com o SHA do commit (nome imutável) e também como `latest.zip`; o da `notificacao` vai só com o SHA do commit. Os nomes do bucket e das funções vêm do SSM (`/tech-challenge/producao/infra/*`).
- Rollback: reverter o commit na `main` ou, manualmente, localizar no bucket de artefatos o ZIP do SHA anterior (`lambda-auth-cpf/<sha>.zip` ou `lambda-notificacao/<sha>.zip`) e executar `aws lambda update-function-code` apontando para ele (`--s3-bucket` e `--s3-key`).

## Documentação

- Contrato do `POST /auth/cpf`, variáveis de ambiente e fluxo de tokens: [`docs/contrato-auth-cpf.md`](docs/contrato-auth-cpf.md)
- Contrato dos eventos de notificação, formatos aceitos e DLQ: [`docs/contrato-evento-notificacao.md`](docs/contrato-evento-notificacao.md)
- Contribuição: [`CONTRIBUTING.md`](CONTRIBUTING.md)

Repositórios relacionados, todos em `github.com/7feeh7/<repositório>`: `tech-challenge-oficina` (OS Service, ADRs e rotas internas), `tech-challenge-infra-kubernetes` (Lambdas, Gateway, filas e segredos), `tech-challenge-billing`, `tech-challenge-execution` e `tech-challenge-infra-database`.

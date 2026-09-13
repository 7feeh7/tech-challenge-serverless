# Contrato `POST /auth/cpf`

## Request

```http
POST /auth/cpf
Content-Type: application/json
X-Correlation-Id: opcional
```

```json
{
  "cpf": "529.982.247-25"
}
```

## Resposta de sucesso (`200`)

```json
{
  "accessToken": "<jwt>",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

## Catálogo de erros

| HTTP | code | Quando |
| --- | --- | --- |
| 400 | `BODY_INVALIDO` | JSON malformado |
| 400 | `CPF_OBRIGATORIO` | Campo `cpf` ausente ou inválido |
| 400 | `CPF_INVALIDO` | CPF com dígitos verificadores inválidos ou sequência repetida |
| 401 | `NAO_AUTORIZADO` | Cliente inexistente **ou** inativo (mesma resposta) |
| 500 | `ERRO_INTERNO` | Falha interna |

## JWT de cliente

| Claim | Valor |
| --- | --- |
| `sub` | UUID do cliente |
| `tipo` | `CLIENTE` |
| `perfil` | `CLIENTE` |
| `iss` | `tech-challenge-auth` (configurável) |
| `aud` | `tech-challenge-api` (configurável) |
| `iat`, `exp` | Emitidos pelo emissor |
| `jti` | UUID único por token |

Algoritmo: **HS256**. Expiração padrão: **1 hora**.

CPF, nome, e-mail e telefone **não** entram no token.

## Política de renovação

Não há refresh token. Token expirado exige nova autenticação por CPF.

Tokens já emitidos deixam de ser aceitos pela API quando o cliente é inativado (a Function não emite novos tokens; validação de ownership/perfil permanece na API).

## Rotação do segredo

O segredo é compartilhado entre Function e API via Secrets Manager (`JWT_SECRET_ARN`) ou variável protegida em desenvolvimento. Valores locais nunca devem ser reutilizados no ambiente provisionado. Rotação: criar nova versão do secret, atualizar API e Function na mesma janela, invalidando tokens antigos.

## Variáveis de runtime

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DB_SECRET_ARN` | sim | Credenciais PostgreSQL |
| `JWT_SECRET_ARN` | produção | Segredo de assinatura |
| `JWT_SECRET` | local | Fallback quando ARN ausente |
| `JWT_ISSUER` | não | Default `tech-challenge-auth` |
| `JWT_AUDIENCE` | não | Default `tech-challenge-api` |

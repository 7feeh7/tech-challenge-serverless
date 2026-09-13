import { createHash } from 'crypto';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE = process.env.AUTH_RATE_LIMIT_TABLE ?? '';
const MAX_TENTATIVAS = parseInt(process.env.AUTH_CPF_MAX_ATTEMPTS ?? '5', 10);
const JANELA_SEGUNDOS = parseInt(process.env.AUTH_CPF_WINDOW_SECONDS ?? '300', 10);

export class CpfRateLimitExceeded extends Error {
  constructor() {
    super('rate_limit_exceeded');
  }
}

function hashCpf(cpf: string): string {
  return createHash('sha256').update(cpf).digest('hex');
}

export async function verificarLimiteCpf(cpf: string): Promise<void> {
  if (!TABLE) {
    return;
  }

  const cpfHash = hashCpf(cpf);
  const ttl = Math.floor(Date.now() / 1000) + JANELA_SEGUNDOS * 2;

  try {
    await client.send(
      new UpdateItemCommand({
        TableName: TABLE,
        Key: { cpfHash: { S: cpfHash } },
        UpdateExpression:
          'SET attempts = if_not_exists(attempts, :zero) + :one, expiresAt = :ttl',
        ConditionExpression: 'attribute_not_exists(attempts) OR attempts < :max',
        ExpressionAttributeValues: {
          ':zero': { N: '0' },
          ':one': { N: '1' },
          ':max': { N: String(MAX_TENTATIVAS) },
          ':ttl': { N: String(ttl) },
        },
      }),
    );
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      throw new CpfRateLimitExceeded();
    }
    throw error;
  }
}

export function obterLimitesConfigurados(): {
  maxTentativas: number;
  janelaSegundos: number;
} {
  return { maxTentativas: MAX_TENTATIVAS, janelaSegundos: JANELA_SEGUNDOS };
}

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
const cache = new Map<string, string>();

import { logIntegrationMetric } from './integration-metrics.service';

export async function obterSecret(secretArn: string): Promise<string> {
  const cached = cache.get(secretArn);
  if (cached) return cached;

  const startedAt = Date.now();
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );

    const value = response.SecretString;
    if (!value) {
      throw new Error(`Secret ${secretArn} vazio`);
    }

    cache.set(secretArn, value);
    logIntegrationMetric({
      integration: 'secrets_manager',
      result: 'success',
      durationMs: Date.now() - startedAt,
    });
    return value;
  } catch (error) {
    logIntegrationMetric({
      integration: 'secrets_manager',
      result: 'failure',
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export function limparCacheSecrets(): void {
  cache.clear();
}

export async function obterCampoSecret(
  secretArn: string,
  campo: string,
): Promise<string> {
  const bruto = await obterSecret(secretArn);

  // O erro nativo do JSON.parse cita trechos do conteudo, que e sigiloso.
  let conteudo: Record<string, unknown>;
  try {
    conteudo = JSON.parse(bruto) as Record<string, unknown>;
  } catch {
    throw new Error(`Secret ${secretArn} nao e um JSON valido`);
  }

  const valor = conteudo?.[campo];
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new Error(`Secret ${secretArn} sem o campo ${campo}`);
  }

  return valor;
}

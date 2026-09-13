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

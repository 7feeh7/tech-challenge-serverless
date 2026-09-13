import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});
const cache = new Map<string, string>();

export async function obterSecret(secretArn: string): Promise<string> {
  const cached = cache.get(secretArn);
  if (cached) return cached;

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  const value = response.SecretString;
  if (!value) {
    throw new Error(`Secret ${secretArn} vazio`);
  }

  cache.set(secretArn, value);
  return value;
}

export function limparCacheSecrets(): void {
  cache.clear();
}

import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';
import { Cliente } from '../types';

let client: Client | null = null;

interface DbCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

let dbCredentials: DbCredentials | null = null;
const secretsClient = new SecretsManagerClient({});

async function getDbCredentials(): Promise<DbCredentials> {
  if (!dbCredentials) {
    const secretArn = process.env.DB_SECRET_ARN;
    if (!secretArn) {
      throw new Error('DB_SECRET_ARN nao configurado');
    }

    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );

    const secret = JSON.parse(response.SecretString || '{}');

    dbCredentials = {
      host: secret.host,
      port: parseInt(secret.port || '5432', 10),
      user: secret.username,
      password: secret.password,
      database: secret.dbname || 'oficina',
    };
  }

  return dbCredentials;
}

async function getConnection(): Promise<Client> {
  if (!client) {
    const creds = await getDbCredentials();
    client = new Client({
      host: creds.host,
      port: creds.port,
      user: creds.user,
      password: creds.password,
      database: creds.database,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
  }
  return client;
}

export async function buscarClientePorCPF(cpf: string): Promise<Cliente | null> {
  const conn = await getConnection();
  const result = await conn.query<Cliente>(
    'SELECT id, nome, documento, email, telefone FROM clientes WHERE documento = $1',
    [cpf],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

export function resetCredentialsCache(): void {
  dbCredentials = null;
}

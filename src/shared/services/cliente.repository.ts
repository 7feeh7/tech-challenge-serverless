import { Client } from 'pg';
import { ClienteRepository } from '../ports/cliente.repository';
import { ClienteAuth } from '../types';
import { obterSecret } from './secrets.service';

let client: Client | null = null;
let dbCredentials: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} | null = null;

async function getDbCredentials() {
  if (!dbCredentials) {
    const secretArn = process.env.DB_SECRET_ARN;
    if (!secretArn) {
      throw new Error('DB_SECRET_ARN nao configurado');
    }

    const secret = JSON.parse(await obterSecret(secretArn)) as {
      host: string;
      port: string | number;
      username: string;
      password: string;
      dbname?: string;
    };

    dbCredentials = {
      host: secret.host,
      port: parseInt(String(secret.port || '5432'), 10),
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

export class PostgresClienteRepository implements ClienteRepository {
  async buscarPorCpf(cpf: string): Promise<ClienteAuth | null> {
    const conn = await getConnection();
    const result = await conn.query<{ id: string; ativo: boolean }>(
      'SELECT id, ativo FROM clientes WHERE cpf_cnpj = $1 AND LENGTH(cpf_cnpj) = 11',
      [cpf],
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  }
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.end();
    client = null;
  }
}

export function resetDbCache(): void {
  dbCredentials = null;
}

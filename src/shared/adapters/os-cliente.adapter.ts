import { ClienteRepository } from '../ports/cliente.repository';
import { logIntegrationMetric } from '../services/integration-metrics.service';
import { obterCampoSecret } from '../services/secrets.service';
import { ClienteAuth } from '../types';
import { ConsultaClienteOsError } from '../types/consulta-cliente-os.error';

// Login e sincrono para o cliente final: falha rapido em vez de consumir os
// 30 s da Lambda. A consulta ao OS responde em dezenas de ms, entao 3 s cobre
// picos e deixa folga para a leitura do segredo e a assinatura do token.
const TIMEOUT_CONSULTA_OS_MS = 3000;

const CODIGO_CLIENTE_NAO_ENCONTRADO = 'CLIENTE_NAO_ENCONTRADO';

interface RespostaOs {
  status: number;
  corpo: unknown;
}

export class OsClienteRepository implements ClienteRepository {
  constructor(private readonly requestId: string) {}

  async buscarPorCpf(cpf: string): Promise<ClienteAuth | null> {
    const inicio = Date.now();

    try {
      const cliente = await this.consultar(cpf);
      this.registrarMetrica('success', inicio);
      return cliente;
    } catch (error) {
      this.registrarMetrica('failure', inicio);
      throw error;
    }
  }

  private async consultar(cpf: string): Promise<ClienteAuth | null> {
    const { status, corpo } = await this.requisitar(cpf);

    if (status === 200) {
      return this.extrairCliente(corpo);
    }
    if (status === 404 && this.ehClienteNaoEncontrado(corpo)) {
      return null;
    }
    if (status === 401 || status === 403) {
      throw new ConsultaClienteOsError('acesso_negado', status);
    }
    if (status >= 500) {
      throw new ConsultaClienteOsError('indisponivel', status);
    }
    // Inclui 404 sem o codigo do OS: rota ou URL base errada nao pode virar
    // "cliente inexistente" e negar todos os logins em silencio.
    throw new ConsultaClienteOsError('resposta_invalida', status);
  }

  private async requisitar(cpf: string): Promise<RespostaOs> {
    const baseUrl = process.env.OS_SERVICE_BASE_URL;
    if (!baseUrl) {
      throw new Error('OS_SERVICE_BASE_URL nao configurado');
    }
    const tokenArn = process.env.AUTH_CPF_OS_TOKEN_ARN;
    if (!tokenArn) {
      throw new Error('AUTH_CPF_OS_TOKEN_ARN nao configurado');
    }

    const token = await obterCampoSecret(tokenArn, 'token');
    const url = `${baseUrl.replace(/\/+$/, '')}/internal/clientes?cpf=${encodeURIComponent(cpf)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_CONSULTA_OS_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Request-Id': this.requestId,
          // Antes de existir uma OS nao ha correlationId de negocio (D7.2):
          // o identificador da requisicao ocupa o lugar dele.
          'X-Correlation-Id': this.requestId,
        },
        signal: controller.signal,
      });
      const texto = await response.text();
      return { status: response.status, corpo: this.lerJson(texto) };
    } catch {
      throw new ConsultaClienteOsError(
        controller.signal.aborted ? 'timeout' : 'indisponivel',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private lerJson(texto: string): unknown {
    try {
      return JSON.parse(texto);
    } catch {
      return null;
    }
  }

  private extrairCliente(corpo: unknown): ClienteAuth {
    const { id, ativo } = (corpo ?? {}) as Partial<ClienteAuth>;
    if (typeof id !== 'string' || !id || typeof ativo !== 'boolean') {
      throw new ConsultaClienteOsError('resposta_invalida', 200);
    }
    return { id, ativo };
  }

  private ehClienteNaoEncontrado(corpo: unknown): boolean {
    return (
      (corpo as { codigo?: unknown } | null)?.codigo ===
      CODIGO_CLIENTE_NAO_ENCONTRADO
    );
  }

  private registrarMetrica(result: 'success' | 'failure', inicio: number): void {
    logIntegrationMetric({
      integration: 'os_service',
      result,
      durationMs: Date.now() - inicio,
      correlationId: this.requestId,
    });
  }
}

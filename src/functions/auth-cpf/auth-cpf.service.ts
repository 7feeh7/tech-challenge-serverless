import { jsonResponse } from '../../shared/adapters/api-gateway.adapter';
import { HttpRequest, HttpResponse } from '../../shared/adapters/http.types';
import { ClienteRepository } from '../../shared/ports/cliente.repository';
import { gerarTokenCliente, obterExpiracaoSegundos } from '../../shared/services/jwt.service';
import { logAuthEvent, mascararCpf } from '../../shared/services/logger.service';
import { limparCPF, validarCPF } from '../../shared/validators/cpf.validator';

export class AuthCpfService {
  constructor(private readonly clientes: ClienteRepository) {}

  async autenticar(request: HttpRequest): Promise<HttpResponse> {
    const inicio = Date.now();
    const { correlationId } = request;

    if (request.method === 'OPTIONS') {
      return jsonResponse(200, {});
    }

    let cpfRaw: string | undefined;
    try {
      const body = JSON.parse(request.body || '{}') as { cpf?: unknown };
      if (typeof body.cpf !== 'string') {
        return this.erro(
          400,
          'CPF e obrigatorio',
          'CPF_OBRIGATORIO',
          correlationId,
          inicio,
          'body_invalido',
        );
      }
      cpfRaw = body.cpf;
    } catch {
      return this.erro(
        400,
        'Body invalido',
        'BODY_INVALIDO',
        correlationId,
        inicio,
        'body_invalido',
      );
    }

    const cpfLimpo = limparCPF(cpfRaw);
    if (!validarCPF(cpfLimpo)) {
      return this.erro(
        400,
        'CPF invalido',
        'CPF_INVALIDO',
        correlationId,
        inicio,
        'cpf_invalido',
        cpfLimpo,
      );
    }

    const cliente = await this.clientes.buscarPorCpf(cpfLimpo);
    if (!cliente || !cliente.ativo) {
      return this.erro(
        401,
        'Nao autorizado',
        'NAO_AUTORIZADO',
        correlationId,
        inicio,
        'nao_autorizado',
        cpfLimpo,
      );
    }

    const accessToken = await gerarTokenCliente(cliente.id);

    logAuthEvent({
      correlationId,
      resultado: 'sucesso',
      duracaoMs: Date.now() - inicio,
      cpfMascarado: mascararCpf(cpfLimpo),
    });

    return jsonResponse(200, {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: obterExpiracaoSegundos(),
    });
  }

  private erro(
    statusCode: number,
    error: string,
    code: string,
    correlationId: string,
    inicio: number,
    resultado: 'nao_autorizado' | 'cpf_invalido' | 'body_invalido' | 'erro_interno',
    cpf?: string,
  ): HttpResponse {
    logAuthEvent({
      correlationId,
      resultado,
      duracaoMs: Date.now() - inicio,
      ...(cpf ? { cpfMascarado: mascararCpf(cpf) } : {}),
    });

    return jsonResponse(statusCode, { error, code });
  }
}

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  optionsResponse,
  parseApiGatewayEvent,
  toApiGatewayResult,
} from '../../shared/adapters/api-gateway.adapter';
import { OsClienteRepository } from '../../shared/adapters/os-cliente.adapter';
import { emitirMetricaAuth } from '../../shared/services/auth-metrics.service';
import { logAuthEvent, logErroInterno } from '../../shared/services/logger.service';
import { AuthCpfService } from './auth-cpf.service';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return optionsResponse();
  }

  const inicio = Date.now();
  // Identificador gerado pela AWS: o X-Correlation-Id enviado pelo cliente nao
  // e confiavel nos logs e nao existe OS para correlacionar (D7.2).
  const correlationId = context.awsRequestId;
  const request = { ...parseApiGatewayEvent(event), correlationId };
  const authService = new AuthCpfService(new OsClienteRepository(correlationId));

  try {
    const response = await authService.autenticar(request);
    return toApiGatewayResult(response, correlationId);
  } catch (error) {
    logErroInterno(correlationId, error);
    logAuthEvent({
      correlationId,
      resultado: 'erro_interno',
      duracaoMs: Date.now() - inicio,
    });
    emitirMetricaAuth({
      resultado: 'erro_interno',
      correlationId,
      sourceIp: request.sourceIp,
    });

    const response = {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Erro interno do servidor',
        code: 'ERRO_INTERNO',
      }),
    };
    return toApiGatewayResult(response, correlationId);
  }
};

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  optionsResponse,
  parseApiGatewayEvent,
  toApiGatewayResult,
} from '../../shared/adapters/api-gateway.adapter';
import { AuthCpfService } from './auth-cpf.service';
import { PostgresClienteRepository } from '../../shared/services/cliente.repository';

const authService = new AuthCpfService(new PostgresClienteRepository());

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return optionsResponse();
  }

  const request = parseApiGatewayEvent(event);

  try {
    const response = await authService.autenticar(request);
    return toApiGatewayResult(response, request.correlationId);
  } catch {
    const response = {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Erro interno do servidor',
        code: 'ERRO_INTERNO',
      }),
    };
    return toApiGatewayResult(response, request.correlationId);
  }
};

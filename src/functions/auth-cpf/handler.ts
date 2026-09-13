import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validarCPF, limparCPF } from '../../shared/validators/cpf.validator';
import { buscarClientePorCPF } from '../../shared/services/database.service';
import { gerarToken } from '../../shared/services/jwt.service';
import { AuthResponse, ErrorResponse } from '../../shared/types';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function errorResponse(statusCode: number, error: string): APIGatewayProxyResult {
  const body: ErrorResponse = { error };
  return { statusCode, headers, body: JSON.stringify(body) };
}

function successResponse(data: AuthResponse): APIGatewayProxyResult {
  return { statusCode: 200, headers, body: JSON.stringify(data) };
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    let body: { cpf?: string };
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return errorResponse(400, 'Body invalido');
    }

    const { cpf } = body;
    if (!cpf) {
      return errorResponse(400, 'CPF e obrigatorio');
    }

    const cpfLimpo = limparCPF(cpf);
    if (!validarCPF(cpfLimpo)) {
      return errorResponse(400, 'CPF invalido');
    }

    const cliente = await buscarClientePorCPF(cpfLimpo);
    if (!cliente) {
      return errorResponse(404, 'Cliente nao encontrado');
    }

    const token = gerarToken({
      sub: cliente.id,
      cpf: cliente.documento,
      nome: cliente.nome,
      email: cliente.email,
      roles: ['CLIENTE'],
    });

    return successResponse({
      accessToken: token,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
      },
    });
  } catch (error) {
    console.error('Erro na autenticacao:', error);
    return errorResponse(500, 'Erro interno do servidor');
  }
};

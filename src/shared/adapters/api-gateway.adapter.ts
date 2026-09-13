import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HttpRequest, HttpResponse } from './http.types';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Correlation-Id',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

export function parseApiGatewayEvent(event: APIGatewayProxyEvent): HttpRequest {
  return {
    method: event.httpMethod,
    body: event.body,
    correlationId:
      event.headers['x-correlation-id'] ??
      event.headers['X-Correlation-Id'] ??
      event.requestContext.requestId,
  };
}

export function toApiGatewayResult(
  response: HttpResponse,
  correlationId: string,
): APIGatewayProxyResult {
  return {
    statusCode: response.statusCode,
    headers: {
      ...CORS_HEADERS,
      'X-Correlation-Id': correlationId,
    },
    body: response.body,
  };
}

export function jsonResponse(
  statusCode: number,
  payload: Record<string, unknown>,
): HttpResponse {
  return {
    statusCode,
    body: JSON.stringify(payload),
  };
}

export function optionsResponse(): APIGatewayProxyResult {
  return { statusCode: 200, headers: CORS_HEADERS, body: '' };
}

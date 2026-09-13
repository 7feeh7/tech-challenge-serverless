import {
  jsonResponse,
  parseApiGatewayEvent,
  toApiGatewayResult,
} from '../src/shared/adapters/api-gateway.adapter';

describe('api-gateway.adapter', () => {
  it('extrai correlationId do header ou requestId', () => {
    const event = {
      httpMethod: 'POST',
      body: '{"cpf":"529.982.247-25"}',
      headers: { 'x-correlation-id': 'abc-123' },
      requestContext: { requestId: 'req-fallback' },
    } as never;

    expect(parseApiGatewayEvent(event).correlationId).toBe('abc-123');
  });

  it('monta resposta API Gateway com header de correlacao', () => {
    const http = jsonResponse(200, { ok: true });
    const result = toApiGatewayResult(http, 'abc-123');

    expect(result.statusCode).toBe(200);
    expect(result.headers?.['X-Correlation-Id']).toBe('abc-123');
  });
});

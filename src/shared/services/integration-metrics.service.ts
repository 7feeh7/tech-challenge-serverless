export type IntegrationName =
  | 'postgresql'
  | 'sns'
  | 'sqs'
  | 'sendgrid'
  | 'secrets_manager'
  | 'lambda';

export function logIntegrationMetric(input: {
  integration: IntegrationName;
  result: 'success' | 'failure';
  durationMs: number;
  correlationId?: string;
}): void {
  console.log(
    JSON.stringify({
      evento: 'integracao_metrica',
      metric: 'oficina.integracao.latencia',
      integration: input.integration,
      result: input.result,
      durationMs: input.durationMs,
      correlationId: input.correlationId,
      environment: process.env.NODE_ENV ?? 'development',
      service:
        process.env.AWS_LAMBDA_FUNCTION_NAME ??
        'tech-challenge-serverless',
    }),
  );

  if (input.result === 'failure') {
    console.log(
      JSON.stringify({
        evento: 'integracao_metrica',
        metric: 'oficina.integracao.falha',
        integration: input.integration,
        correlationId: input.correlationId,
        environment: process.env.NODE_ENV ?? 'development',
      }),
    );
  }
}

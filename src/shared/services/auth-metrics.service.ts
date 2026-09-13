export type AuthResultado =
  | 'sucesso'
  | 'nao_autorizado'
  | 'cpf_invalido'
  | 'body_invalido'
  | 'rate_limit'
  | 'erro_interno';

function mascararPrefixoIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  const partes = ip.split('.');
  if (partes.length === 4) {
    return `${partes[0]}.${partes[1]}.x.x`;
  }
  return 'x.x.x.x';
}

export function emitirMetricaAuth(input: {
  resultado: AuthResultado;
  correlationId: string;
  sourceIp?: string;
}): void {
  const ipAgregado = mascararPrefixoIp(input.sourceIp);
  const falha =
    input.resultado === 'nao_autorizado' ||
    input.resultado === 'cpf_invalido' ||
    input.resultado === 'rate_limit';

  console.log(
    JSON.stringify({
      evento: 'auth_cpf_metrica',
      metric: 'auth.cpf.attempts',
      resultado: input.resultado,
      correlationId: input.correlationId,
      ...(ipAgregado ? { sourceIpPrefix: ipAgregado } : {}),
      environment: process.env.NODE_ENV ?? 'development',
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: 'TechChallenge/Auth',
            Dimensions: [['Environment', 'Resultado']],
            Metrics: [{ Name: 'AuthCpfAttempts', Unit: 'Count' }],
          },
        ],
      },
      Environment: process.env.NODE_ENV ?? 'production',
      Resultado: input.resultado,
      AuthCpfAttempts: 1,
    }),
  );

  if (falha) {
    console.log(
      JSON.stringify({
        evento: 'auth_cpf_metrica',
        metric: 'auth.cpf.failures',
        resultado: input.resultado,
        correlationId: input.correlationId,
        ...(ipAgregado ? { sourceIpPrefix: ipAgregado } : {}),
        environment: process.env.NODE_ENV ?? 'development',
        _aws: {
          Timestamp: Date.now(),
          CloudWatchMetrics: [
            {
              Namespace: 'TechChallenge/Auth',
              Dimensions: [['Environment', 'Resultado']],
              Metrics: [{ Name: 'AuthCpfFailures', Unit: 'Count' }],
            },
          ],
        },
        Environment: process.env.NODE_ENV ?? 'production',
        Resultado: input.resultado,
        AuthCpfFailures: 1,
      }),
    );
  }
}

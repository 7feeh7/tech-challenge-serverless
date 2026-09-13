import { verificarLimiteCpf } from '../src/shared/services/cpf-rate-limit.service';

describe('cpf-rate-limit.service', () => {
  const originalTable = process.env.AUTH_RATE_LIMIT_TABLE;

  afterEach(() => {
    process.env.AUTH_RATE_LIMIT_TABLE = originalTable;
  });

  it('ignora limite quando tabela nao configurada (testes locais)', async () => {
    delete process.env.AUTH_RATE_LIMIT_TABLE;
    await expect(verificarLimiteCpf('52998224725')).resolves.toBeUndefined();
  });
});

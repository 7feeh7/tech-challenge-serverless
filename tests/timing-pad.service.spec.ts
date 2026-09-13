import {
  garantirTempoRespostaUniforme,
  obterTempoAlvoMs,
} from '../src/shared/services/timing-pad.service';

describe('timing-pad.service', () => {
  beforeEach(() => {
    process.env.AUTH_RESPONSE_TARGET_MS = '50';
  });

  it('aguarda ate atingir tempo alvo minimo', async () => {
    const inicio = Date.now();
    await garantirTempoRespostaUniforme(inicio);
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(obterTempoAlvoMs());
  });
});

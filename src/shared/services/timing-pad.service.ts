const TEMPO_ALVO_MS = parseInt(process.env.AUTH_RESPONSE_TARGET_MS ?? '300', 10);
const JITTER_MS = 30;

export async function garantirTempoRespostaUniforme(inicio: number): Promise<void> {
  const decorrido = Date.now() - inicio;
  const alvo = TEMPO_ALVO_MS + Math.floor(Math.random() * JITTER_MS);
  if (decorrido < alvo) {
    await new Promise((resolve) => setTimeout(resolve, alvo - decorrido));
  }
}

export function obterTempoAlvoMs(): number {
  return TEMPO_ALVO_MS;
}

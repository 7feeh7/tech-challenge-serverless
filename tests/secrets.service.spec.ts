import {
  limparCacheSecrets,
  obterCampoSecret,
  obterSecret,
} from '../src/shared/services/secrets.service';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({
    send: (...argumentos: unknown[]) => sendMock(...argumentos),
  })),
  GetSecretValueCommand: jest.fn((input: unknown) => input),
}));

describe('secrets.service', () => {
  const arn = 'arn:aws:secretsmanager:segredo';

  beforeEach(() => {
    limparCacheSecrets();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('obterSecret', () => {
    it('le o segredo uma vez e reutiliza o cache', async () => {
      sendMock.mockResolvedValue({ SecretString: 'valor' });

      await obterSecret(arn);
      await expect(obterSecret(arn)).resolves.toBe('valor');

      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it('falha quando o segredo esta vazio', async () => {
      sendMock.mockResolvedValue({ SecretString: '' });

      await expect(obterSecret(arn)).rejects.toThrow('vazio');
    });

    it('propaga a falha do Secrets Manager', async () => {
      sendMock.mockRejectedValue(new Error('AccessDenied'));

      await expect(obterSecret(arn)).rejects.toThrow('AccessDenied');
    });
  });

  describe('obterCampoSecret', () => {
    it('retorna o campo do JSON do segredo', async () => {
      sendMock.mockResolvedValue({ SecretString: '{"token":"abc"}' });

      await expect(obterCampoSecret(arn, 'token')).resolves.toBe('abc');
    });

    it('falha sem vazar o conteudo quando o segredo nao e JSON', async () => {
      sendMock.mockResolvedValue({ SecretString: 'conteudo-sigiloso' });

      const erro = (await obterCampoSecret(arn, 'token').catch(
        (e: Error) => e,
      )) as Error;

      expect(erro.message).toBe(`Secret ${arn} nao e um JSON valido`);
      expect(erro.message).not.toContain('conteudo-sigiloso');
    });

    it.each([
      ['ausente', '{"outro":"x"}'],
      ['vazio', '{"token":"  "}'],
      ['nao textual', '{"token":123}'],
      ['em JSON nulo', 'null'],
    ])('falha quando o campo esta %s', async (_descricao, secretString) => {
      sendMock.mockResolvedValue({ SecretString: secretString });

      await expect(obterCampoSecret(arn, 'token')).rejects.toThrow(
        `Secret ${arn} sem o campo token`,
      );
    });
  });
});

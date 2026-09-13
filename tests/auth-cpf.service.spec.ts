import { AuthCpfService } from '../src/functions/auth-cpf/auth-cpf.service';
import { ClienteRepository } from '../src/shared/ports/cliente.repository';
import * as jwtService from '../src/shared/services/jwt.service';

describe('AuthCpfService', () => {
  const clientes: jest.Mocked<ClienteRepository> = {
    buscarPorCpf: jest.fn(),
  };

  const service = new AuthCpfService(clientes);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(jwtService, 'gerarTokenCliente').mockResolvedValue('token-jwt');
    jest.spyOn(jwtService, 'obterExpiracaoSegundos').mockReturnValue(3600);
  });

  const request = (body: unknown, method = 'POST') => ({
    method,
    body: JSON.stringify(body),
    correlationId: 'corr-1',
  });

  it('retorna 400 para body malformado', async () => {
    const response = await service.autenticar({
      method: 'POST',
      body: '{invalido',
      correlationId: 'corr-1',
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      code: 'BODY_INVALIDO',
    });
  });

  it('retorna 400 quando CPF ausente', async () => {
    const response = await service.autenticar(request({}));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).code).toBe('CPF_OBRIGATORIO');
  });

  it('retorna 400 para CPF invalido', async () => {
    const response = await service.autenticar(request({ cpf: '111.111.111-11' }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).code).toBe('CPF_INVALIDO');
  });

  it('retorna 401 para cliente inexistente', async () => {
    clientes.buscarPorCpf.mockResolvedValue(null);

    const response = await service.autenticar(request({ cpf: '529.982.247-25' }));

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Nao autorizado',
      code: 'NAO_AUTORIZADO',
    });
  });

  it('retorna 401 para cliente inativo', async () => {
    clientes.buscarPorCpf.mockResolvedValue({ id: 'uuid-1', ativo: false });

    const response = await service.autenticar(request({ cpf: '529.982.247-25' }));

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).code).toBe('NAO_AUTORIZADO');
  });

  it('retorna token para cliente ativo com CPF mascarado ou limpo', async () => {
    clientes.buscarPorCpf.mockResolvedValue({ id: 'uuid-1', ativo: true });

    const response = await service.autenticar(request({ cpf: '52998224725' }));

    expect(clientes.buscarPorCpf).toHaveBeenCalledWith('52998224725');
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      accessToken: 'token-jwt',
      tokenType: 'Bearer',
      expiresIn: 3600,
    });
  });
});

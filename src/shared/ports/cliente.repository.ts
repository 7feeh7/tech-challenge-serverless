import { ClienteAuth } from '../types';

export interface ClienteRepository {
  buscarPorCpf(cpf: string): Promise<ClienteAuth | null>;
}

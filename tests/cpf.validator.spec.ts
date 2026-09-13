import { validarCPF, limparCPF } from '../src/shared/validators/cpf.validator';

describe('cpf.validator', () => {
  it('limpa caracteres nao numericos', () => {
    expect(limparCPF('123.456.789-09')).toBe('12345678909');
  });

  it('rejeita CPF com digitos iguais', () => {
    expect(validarCPF('111.111.111-11')).toBe(false);
  });

  it('valida CPF correto', () => {
    expect(validarCPF('529.982.247-25')).toBe(true);
  });

  it('rejeita CPF invalido', () => {
    expect(validarCPF('123.456.789-00')).toBe(false);
  });

  it('rejeita CPF vazio', () => {
    expect(validarCPF('')).toBe(false);
  });
});

export function limparCPF(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function validarCPF(cpf: string): boolean {
  const cpfLimpo = limparCPF(cpf);

  if (cpfLimpo.length !== 11) {
    return false;
  }

  if (/^(\d)\1+$/.test(cpfLimpo)) {
    return false;
  }

  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpfLimpo[i]) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) {
    resto = 0;
  }
  if (resto !== parseInt(cpfLimpo[9])) {
    return false;
  }

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpfLimpo[i]) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) {
    resto = 0;
  }
  if (resto !== parseInt(cpfLimpo[10])) {
    return false;
  }

  return true;
}

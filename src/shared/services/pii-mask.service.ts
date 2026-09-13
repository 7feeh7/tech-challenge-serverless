const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function mascararEmail(email: string): string {
  return email.replace(EMAIL_PATTERN, (valor) => {
    const [local, dominio] = valor.split('@');
    if (!dominio) return '[email-redacted]';
    const visivel = local.slice(0, Math.min(2, local.length));
    return `${visivel}***@${dominio}`;
  });
}

export function sanitizarDetalhe(detalhe?: string): string | undefined {
  if (!detalhe) return detalhe;
  return mascararEmail(detalhe);
}

/** CNPJ com 14 dígitos e dígitos verificadores corretos? (aceita com ou sem pontuação) */
export function cnpjValido(texto: string): boolean {
  const d = texto.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digitos = d.split("").map(Number);
  const dv = (base: number[], pesos: number[]) => {
    const resto = base.reduce((soma, n, i) => soma + n * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(digitos.slice(0, 12).concat(d1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === digitos[12] && d2 === digitos[13];
}

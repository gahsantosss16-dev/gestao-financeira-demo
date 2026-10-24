/** Escapa uma célula para CSV (separador ;) e neutraliza fórmulas (CSV injection). */
export function celulaCsv(valor: string): string {
  let v = valor ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function gerarCsv(cabecalho: string[], linhas: string[][]): string {
  return [cabecalho, ...linhas].map((linha) => linha.map(celulaCsv).join(";")).join("\r\n");
}

export function baixarCsv(nome: string, cabecalho: string[], linhas: string[][]) {
  // BOM para o Excel reconhecer acentos.
  const blob = new Blob(["﻿", gerarCsv(cabecalho, linhas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

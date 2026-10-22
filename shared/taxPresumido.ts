// Regras tributárias do Lucro Presumido (EG) e fórmula de BDI — funções puras,
// sem dependência de tela. Servem de referência para conferência e testes
// (server/taxPresumido.test.ts). Percentuais em "pontos" (17.53 = 17,53%).

/** BDI = [(1+AC)(1+R)(1+G)] / (1−L−I) − 1, em %. Mesma fórmula do app inteiro. */
export function calcBdiPct(ac: number, l: number, i: number, r = 0, g = 0): number {
  const num = (1 + ac / 100) * (1 + r / 100) * (1 + g / 100);
  const den = 1 - l / 100 - i / 100;
  return den > 0 ? (num / den - 1) * 100 : 0;
}

export interface PresumidoParams {
  pis: number; cofins: number; iss: number;     // %
  presuncao: number;                            // % de presunção (8, 12, 32...) p/ IRPJ
  presuncaoCsll?: number;                       // se omitido, usa a mesma de IRPJ
  aliqIRPJ: number; aliqCSLL: number;           // 15 e 9
}

/** Alíquota MARGINAL (contrato novo, acima do limite do adicional de IRPJ), em % da receita. */
export function impostosMarginais(p: PresumidoParams, comAdicional = true): number {
  const presC = p.presuncaoCsll ?? p.presuncao;
  const irpj = (p.presuncao / 100) * p.aliqIRPJ + (comAdicional ? (p.presuncao / 100) * 10 : 0);
  const csll = (presC / 100) * p.aliqCSLL;
  return p.pis + p.cofins + p.iss + irpj + csll;
}

export interface TrimestreInput {
  receitaTotal: number;       // receita bruta do trimestre
  receitaSemIss: number;      // parte sem ISS (ex.: locação, 99.01.01)
  presuncao: number;          // 32 p/ mão de obra/serviços
  pis: number; cofins: number; iss: number;
  aliqIRPJ: number; aliqCSLL: number;
  limiteAdicional?: number;   // R$ 60.000 por trimestre
}

export interface TrimestreResultado {
  base: number; irpjBase: number; adicional: number; irpj: number;
  csll: number; pisCofins: number; iss: number; total: number; cargaMediaPct: number;
}

/** Carga de um trimestre (apuração trimestral IRPJ/CSLL). */
export function cargaTrimestre(t: TrimestreInput): TrimestreResultado {
  const limite = t.limiteAdicional ?? 60000;
  const base = (t.presuncao / 100) * t.receitaTotal;
  const irpjBase = (t.aliqIRPJ / 100) * base;
  const adicional = Math.max(0, base - limite) * 0.10;
  const csll = (t.aliqCSLL / 100) * base;
  const pisCofins = ((t.pis + t.cofins) / 100) * t.receitaTotal;
  const iss = (t.iss / 100) * (t.receitaTotal - t.receitaSemIss);
  const irpj = irpjBase + adicional;
  const total = irpj + csll + pisCofins + iss;
  return { base, irpjBase, adicional, irpj, csll, pisCofins, iss, total, cargaMediaPct: (total / t.receitaTotal) * 100 };
}

import { describe, it, expect } from "vitest";
import { calcBdiPct, cargaTrimestre, impostosMarginais } from "../shared/taxPresumido";

const near = (a: number, b: number, tol: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("BDI — casos de referência (AC 3%, L 15%, R 0%, G 0%)", () => {
  const casos: [string, number, number][] = [
    ["mão de obra / parcial (32%)", 17.53, 52.66],
    ["valor digitado hoje", 17.5, 52.59],
    ["global 8/12 sem adicional", 8.93, 35.4],
    ["global 8/12 com adicional", 9.73, 36.84],
    ["Simples Anexo IV (est. 2027)", 12.9, 42.86],
  ];
  for (const [nome, i, esperado] of casos) {
    it(nome, () => near(calcBdiPct(3, 15, i), esperado, 0.01));
  }
});

describe("Impostos marginais por perfil", () => {
  const base = { pis: 0.65, cofins: 3, iss: 3, aliqIRPJ: 15, aliqCSLL: 9 };
  it("32% com adicional = 17,53%", () => near(impostosMarginais({ ...base, presuncao: 32 }), 17.53, 0.01));
  it("8%/12% sem adicional = 8,93%", () => near(impostosMarginais({ ...base, presuncao: 8, presuncaoCsll: 12 }, false), 8.93, 0.01));
  it("8%/12% com adicional = 9,73%", () => near(impostosMarginais({ ...base, presuncao: 8, presuncaoCsll: 12 }), 9.73, 0.01));
});

describe("3º trimestre de 2026 (NFS-e 36 a 42)", () => {
  const r = cargaTrimestre({ receitaTotal: 372905.88, receitaSemIss: 32000, presuncao: 32, pis: 0.65, cofins: 3, iss: 3, aliqIRPJ: 15, aliqCSLL: 9 });
  it("base presumida", () => near(r.base, 119329.88, 0.02));
  it("IRPJ 15%", () => near(r.irpjBase, 17899.48, 0.02));
  it("adicional", () => near(r.adicional, 5932.99, 0.02));
  it("IRPJ total", () => near(r.irpj, 23832.47, 0.02));
  it("CSLL", () => near(r.csll, 10739.69, 0.02));
  it("PIS+COFINS", () => near(r.pisCofins, 13611.06, 0.02));
  it("ISS (sem locação)", () => near(r.iss, 10227.18, 0.02));
  it("carga total", () => near(r.total, 58410.4, 0.02));
  it("carga média 15,66%", () => near(r.cargaMediaPct, 15.66, 0.01));
  it("CSLL a pagar = CSLL − 1% retido", () => near(r.csll - 0.01 * 340905.88, 7330.63, 0.02));
  it("guia emitida foi R$ 803,02 maior", () => near(8133.65 - 7330.63, 803.02, 0.02));
});

describe("Contrato HRSP Bloco 2", () => {
  const v = 2924341.71;
  const m = (x: number) => Math.round(v * x / 100);
  it("carga 17,53% ≈ R$ 512.637", () => near(m(17.53), 512637, 1));
  it("INSS retido 11% ≈ R$ 321.678", () => near(m(11), 321678, 1));
});

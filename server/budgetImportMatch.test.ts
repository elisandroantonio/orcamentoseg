import { describe, it, expect } from "vitest";
import { prepareComps, matchRow, normCode } from "../shared/budgetImportMatch";

const comps = prepareComps([
  { id: 1, code: "SINAPI-96521", description: "ESCAVAÇÃO MECANIZADA PARA BLOCO DE COROAMENTO OU SAPATA, COM PREVISÃO DE FÔRMA, ATÉ 1,5 M", unit: "M3" },
  { id: 2, code: "SINAPI-96525", description: "ESCAVAÇÃO MECANIZADA PARA VIGA BALDRAME", unit: "M3" },
  { id: 3, code: "02.08.020", description: "PLACA DE IDENTIFICAÇÃO PARA OBRA", unit: "M2" },
  { id: 4, code: null, description: "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS", unit: "M2" },
]);

describe("matchRow", () => {
  it("casa por código mesmo com prefixo diferente", () => {
    expect(normCode("SINAPI-96521")).toBe("96521");
    const r = matchRow({ code: "96521", description: "qualquer coisa", unit: "M3" }, comps);
    expect(r[0]).toMatchObject({ compositionId: 1, byCode: true, score: 1 });
  });
  it("casa por descrição quando não há código", () => {
    const r = matchRow({ description: "Escavação mecanizada para bloco", unit: "M3" }, comps);
    expect(r[0].compositionId).toBe(1);
    expect(r[0].score).toBeGreaterThan(0.7);
  });
  it("distingue bloco de viga", () => {
    const r = matchRow({ description: "ESCAVAÇÃO MECANIZADA PARA VIGA BALDRAME", unit: "M3" }, comps);
    expect(r[0].compositionId).toBe(2);
  });
  it("não sugere nada para item sem semelhança", () => {
    const r = matchRow({ description: "Administração local da obra", unit: "MES" }, comps);
    expect(r.length).toBe(0);
  });
  it("unidade diferente reduz a nota", () => {
    const a = matchRow({ description: "Alvenaria de vedação de blocos cerâmicos", unit: "M2" }, comps)[0].score;
    const b = matchRow({ description: "Alvenaria de vedação de blocos cerâmicos", unit: "M3" }, comps)[0].score;
    expect(a).toBeGreaterThan(b);
  });
});

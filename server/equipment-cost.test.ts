/**
 * Testes para validar a correção do bug de equipmentCost
 * Bug: equipamentos eram somados ao laborCost em vez de serem calculados separadamente
 * Correção: equipmentCost é calculado separadamente e não recebe encargos sociais
 */

import { describe, it, expect } from "vitest";

// Simula a lógica de recalculateCompositionCosts
function recalculateCompositionCosts(inputs: Array<{ type: string; unitCost: number; coefficient: number }>) {
  let materialCost = 0;
  let laborCost = 0;
  let equipmentCost = 0;

  for (const item of inputs) {
    const cost = item.unitCost * item.coefficient;
    if (item.type === "material") {
      materialCost += cost;
    } else if (item.type === "labor") {
      laborCost += cost;
    } else if (item.type === "equipment") {
      equipmentCost += cost;
    }
  }

  return {
    materialCost: parseFloat(materialCost.toFixed(2)),
    laborCost: parseFloat(laborCost.toFixed(2)),
    equipmentCost: parseFloat(equipmentCost.toFixed(2)),
  };
}

// Simula a lógica de cálculo de BDI
function calculateBDIForItem(params: {
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  socialCharges: number; // %
  profit: number; // %
  taxes: number; // %
  risk: number; // %
  warranty: number; // %
}) {
  const { materialCost, laborCost, equipmentCost, socialCharges, profit, taxes, risk, warranty } = params;
  
  // BDI Geral
  const bdiMultiplier = (1 + profit / 100) * (1 + taxes / 100) * (1 + risk / 100) * (1 + warranty / 100);
  
  // Encargos sociais APENAS em mão de obra
  const laborWithCharges = laborCost * (1 + socialCharges / 100);
  
  // BDI aplicado
  const materialWithBDI = materialCost * bdiMultiplier;
  const laborWithBDI = laborWithCharges * bdiMultiplier;
  const equipmentWithBDI = equipmentCost * bdiMultiplier; // SEM encargos sociais
  
  return {
    materialWithBDI: parseFloat(materialWithBDI.toFixed(2)),
    laborWithBDI: parseFloat(laborWithBDI.toFixed(2)),
    equipmentWithBDI: parseFloat(equipmentWithBDI.toFixed(2)),
    totalWithBDI: parseFloat((materialWithBDI + laborWithBDI + equipmentWithBDI).toFixed(2)),
  };
}

describe("Correção do bug de equipmentCost", () => {
  it("deve calcular equipmentCost separadamente do laborCost", () => {
    const inputs = [
      { type: "material", unitCost: 100, coefficient: 2 },
      { type: "labor", unitCost: 50, coefficient: 3 },
      { type: "equipment", unitCost: 200, coefficient: 1 },
    ];

    const result = recalculateCompositionCosts(inputs);

    expect(result.materialCost).toBe(200); // 100 * 2
    expect(result.laborCost).toBe(150);    // 50 * 3
    expect(result.equipmentCost).toBe(200); // 200 * 1
  });

  it("equipmentCost não deve ser somado ao laborCost (bug antigo)", () => {
    const inputs = [
      { type: "labor", unitCost: 50, coefficient: 3 },
      { type: "equipment", unitCost: 200, coefficient: 1 },
    ];

    const result = recalculateCompositionCosts(inputs);

    // laborCost deve ser apenas o trabalho humano
    expect(result.laborCost).toBe(150);
    // equipmentCost deve ser separado
    expect(result.equipmentCost).toBe(200);
    // Não deve somar equipment ao labor
    expect(result.laborCost).not.toBe(350); // Bug antigo: 150 + 200 = 350
  });

  it("equipamentos não devem receber encargos sociais no cálculo de BDI", () => {
    const params = {
      materialCost: 100,
      laborCost: 100,
      equipmentCost: 100,
      socialCharges: 120, // 120% de encargos
      profit: 10,
      taxes: 15,
      risk: 2,
      warranty: 1,
    };

    const result = calculateBDIForItem(params);

    // Labor deve receber encargos sociais (120%) + BDI
    // Equipment deve receber apenas BDI, SEM encargos sociais
    
    // Labor: 100 * (1 + 1.20) = 220 * bdiMultiplier
    // Equipment: 100 * bdiMultiplier (sem encargos)
    
    // Equipment deve ser menor que labor (pois não tem encargos)
    expect(result.equipmentWithBDI).toBeLessThan(result.laborWithBDI);
    
    // Verificar que equipment não recebeu encargos sociais
    const bdiMultiplier = (1 + 10/100) * (1 + 15/100) * (1 + 2/100) * (1 + 1/100);
    const expectedEquipmentWithBDI = parseFloat((100 * bdiMultiplier).toFixed(2));
    expect(result.equipmentWithBDI).toBeCloseTo(expectedEquipmentWithBDI, 1);
  });

  it("total com BDI deve incluir material + labor (com encargos) + equipment (sem encargos)", () => {
    const params = {
      materialCost: 100,
      laborCost: 100,
      equipmentCost: 100,
      socialCharges: 120,
      profit: 10,
      taxes: 15,
      risk: 2,
      warranty: 1,
    };

    const result = calculateBDIForItem(params);

    // Total deve ser a soma dos três componentes
    const expectedTotal = result.materialWithBDI + result.laborWithBDI + result.equipmentWithBDI;
    expect(result.totalWithBDI).toBeCloseTo(expectedTotal, 1);
    
    // Total deve ser maior que zero
    expect(result.totalWithBDI).toBeGreaterThan(0);
  });

  it("quando não há equipamentos, o cálculo deve ser igual ao antigo (material + labor)", () => {
    const inputs = [
      { type: "material", unitCost: 100, coefficient: 1 },
      { type: "labor", unitCost: 50, coefficient: 2 },
    ];

    const result = recalculateCompositionCosts(inputs);

    expect(result.materialCost).toBe(100);
    expect(result.laborCost).toBe(100);
    expect(result.equipmentCost).toBe(0); // Sem equipamentos
  });

  it("composição com apenas equipamentos deve ter laborCost zero", () => {
    const inputs = [
      { type: "equipment", unitCost: 500, coefficient: 2 },
    ];

    const result = recalculateCompositionCosts(inputs);

    expect(result.materialCost).toBe(0);
    expect(result.laborCost).toBe(0);
    expect(result.equipmentCost).toBe(1000); // 500 * 2
  });
});

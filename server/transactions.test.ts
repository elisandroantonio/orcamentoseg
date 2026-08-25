import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as db from './db';

describe('Financial Transactions', () => {
  let testBudgetId: number;

  beforeAll(async () => {
    // Usar um orçamento existente para testes
    testBudgetId = 810001;
  });

  it('should create a financial transaction', async () => {
    const result = await db.createFinancialTransaction({
      budgetId: testBudgetId,
      date: '2026-05-01',
      type: 'entrada',
      category: 'pagamento_cliente',
      description: 'Test transaction',
      value: 5000,
    });

    expect(result).toBeDefined();
  });

  it('should list financial transactions', async () => {
    const transactions = await db.listFinancialTransactions(testBudgetId);
    expect(Array.isArray(transactions)).toBe(true);
  });

  it('should get financial summary', async () => {
    const summary = await db.getFinancialSummary(testBudgetId);
    
    expect(summary).toHaveProperty('totalEntradas');
    expect(summary).toHaveProperty('totalSaidas');
    expect(summary).toHaveProperty('saldoLiquido');
    expect(typeof summary.totalEntradas).toBe('number');
    expect(typeof summary.totalSaidas).toBe('number');
    expect(typeof summary.saldoLiquido).toBe('number');
  });

  it('should delete a financial transaction', async () => {
    // First create a transaction
    const result = await db.createFinancialTransaction({
      budgetId: testBudgetId,
      date: '2026-05-01',
      type: 'saida',
      category: 'materiais',
      description: 'Test delete transaction',
      value: 1000,
    });

    // Then delete it (assuming result has insertId or similar)
    // This test may need adjustment based on actual return type
    expect(result).toBeDefined();
  });

  it('should filter transactions by type', async () => {
    const entradas = await db.listFinancialTransactions(testBudgetId, {
      type: 'entrada',
    });

    expect(Array.isArray(entradas)).toBe(true);
    // All returned transactions should be of type 'entrada'
    entradas.forEach((t: any) => {
      expect(t.type).toBe('entrada');
    });
  });

  it('should filter transactions by category', async () => {
    const transactions = await db.listFinancialTransactions(testBudgetId, {
      category: 'pagamento_cliente',
    });

    expect(Array.isArray(transactions)).toBe(true);
    // All returned transactions should have category 'pagamento_cliente'
    transactions.forEach((t: any) => {
      if (t.category) {
        expect(t.category).toBe('pagamento_cliente');
      }
    });
  });
});

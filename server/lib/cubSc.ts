// Busca e interpreta a tabela pública do CUB/SC (Custo Unitário Básico —
// Santa Catarina), publicada mensalmente pelo Sinduscon-SC (até o dia 5 de
// cada mês, com o valor do mês anterior). Não existe API oficial; usamos a
// tabela HTML estática do SENGE-SC (mais simples e estável de interpretar
// do que o formulário em JS do CBIC/cub.org.br).
//
// Importante: o CUB/SC NÃO é "tempo real" — é um índice mensal. O que essa
// função faz é buscar o valor mais recente já publicado.

const SOURCE_URL = "https://www.senge-sc.org.br/tabela-do-cub/";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// { ano: { mes(1-12): valor } }
export type CubScTable = Record<number, Record<number, number>>;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Interpreta o HTML da página do SENGE-SC extraindo, para cada ano, o
 * valor do CUB médio de cada mês. A página tem uma sequência de tabelas
 * HTML simples, cada uma com uma linha de cabeçalho "<ano> | CUB Médio"
 * seguida de 12 linhas "<mês> | R$ x.xxx,xx".
 */
export function parseCubScHtml(html: string): CubScTable {
  const result: CubScTable = {};
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRegex.exec(html))) {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    let currentYear: number | null = null;

    while ((rowMatch = rowRegex.exec(tableMatch[1]))) {
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
        cells.push(stripTags(cellMatch[1]));
      }
      if (cells.length < 2) continue;
      const [c0, c1] = cells;

      if (/^\d{4}$/.test(c0)) {
        currentYear = parseInt(c0, 10);
        if (!result[currentYear]) result[currentYear] = {};
        continue;
      }

      const monthIdx = MONTH_NAMES.indexOf(c0);
      if (monthIdx >= 0 && currentYear) {
        const valueMatch = c1.match(/([\d.]+,\d{2})/);
        if (valueMatch) {
          const value = parseFloat(valueMatch[1].replace(/\./g, "").replace(",", "."));
          if (!Number.isNaN(value) && value > 0) {
            result[currentYear][monthIdx + 1] = value;
          }
        }
      }
    }
  }

  return result;
}

export async function fetchCubScTable(): Promise<CubScTable> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; EGOrcamentos/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`Falha ao buscar CUB/SC (HTTP ${res.status})`);
  }
  const html = await res.text();
  const table = parseCubScHtml(html);
  const anyMonthFound = Object.values(table).some((months) => Object.keys(months).length > 0);
  if (!anyMonthFound) {
    throw new Error(
      "Não consegui interpretar a tabela do CUB/SC (o site pode ter mudado de formato). Cadastre o valor manualmente."
    );
  }
  return table;
}

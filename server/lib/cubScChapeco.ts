// Fonte alternativa/complementar para o CUB/SC: tabela HTML publicada pelo
// Sinduscon de Chapecó (sindusconchapeco.com.br), que reproduz o mesmo
// índice estadual (calculado pelo Sinduscon-SC) que o Sinduscon Grande
// Florianópolis também publica. Adicionada porque o SENGE-SC (fonte
// original já usada por este app, em cubSc.ts) costuma demorar mais para
// atualizar — em 13/09/2026, por exemplo, o SENGE-SC estava parado em
// Julho/2026 enquanto esta tabela já trazia Agosto e Setembro/2026.
//
// ATENÇÃO — convenção de mês diferente entre as fontes:
// Esta tabela (e o Sinduscon-Fpolis) rotula o valor pelo "mês de vigência"
// (ex.: o valor calculado com dados de agosto é publicado como
// "Setembro"). Já o SENGE-SC — e, portanto, o histórico já salvo no banco
// por este app — rotula pelo "mês base" (mês dos dados coletados, um mês
// antes). Por isso, ao importar desta fonte, subtraímos 1 mês (com virada
// de ano quando necessário) do rótulo antes de gravar, para o histórico
// continuar coerente com o que já está salvo, em vez de dar um "salto" de
// um mês para trás quando essa fonte é adicionada.
//
// Confirmado comparando os dois sites em 13/09/2026: SENGE-SC "Julho/2026"
// = R$ 3.151,24 = exatamente o valor que esta tabela publica como
// "Agosto/2026" (e o Sinduscon-Fpolis descreve como "calculado com os
// dados de agosto e válido para setembro" no mesmo valor de Setembro).

import { stripTags, type CubScTable } from "./cubSc";

const SOURCE_URL = "https://www.sindusconchapeco.com.br/novo/cub.html";

// Prefixos em ASCII puro (sem acento), na ordem Jan-Dez. O site não parece
// declarar corretamente sua codificação de caracteres (acentos vêm
// corrompidos mesmo lendo a página no navegador) — "Março" é o único mês
// com acento, então comparar só os 3 primeiros caracteres em ASCII evita
// depender de decodificar certo o "ç"/"ã".
const MONTH_PREFIXES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function monthIndex0(label: string): number {
  const prefix = label.trim().slice(0, 3).toLowerCase();
  return MONTH_PREFIXES.indexOf(prefix); // 0-based; -1 se não reconhecido
}

function parseValue(raw: string): number | null {
  const match = raw.match(/([\d.]+,\d{2})/);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isNaN(value) || value <= 0 ? null : value;
}

/**
 * Interpreta o HTML da tabela do Sinduscon-Chapecó. A página é uma
 * sequência de blocos "<h4 class="preto bold">ANO</h4> ... <table
 * class="tbllistacub">...</table>". Só o formato usado a partir de 2025
 * (duas linhas por mês, Residencial/Comercial, com o nome do mês em
 * rowspan só na primeira) é interpretado — só o valor "Residencial" é
 * usado, para bater com a série que o SENGE-SC já grava hoje (que não
 * distingue residencial/comercial).
 *
 * Anos anteriores a 2025 usam uma linha só por mês, sem essa divisão, e
 * são ignorados de propósito: testando o parser contra o histórico real
 * dessa página, o valor de Janeiro num desses anos antigos não batia com
 * o valor equivalente já salvo (via SENGE-SC) na virada do ano anterior —
 * uma pequena divergência que só aparece nesse formato antigo, bem no
 * limite dez/jan. Como o SENGE-SC já cobre esses anos antigos sem esse
 * problema, é mais seguro deixar esta fonte contribuir só com os meses
 * recentes (2025 em diante), que é justamente o motivo de ela ter sido
 * adicionada.
 */
export function parseCubScChapecoHtml(html: string): CubScTable {
  const result: CubScTable = {};
  const blockRegex = /<h4 class="preto bold">(\d{4})<\/h4>[\s\S]*?<table class="tbllistacub">([\s\S]*?)<\/table>/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(html))) {
    const vigenciaYear = parseInt(blockMatch[1], 10);
    const tableBody = blockMatch[2];

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(tableBody))) {
      if (/<th[\s>]/i.test(rowMatch[1])) continue; // linha de cabeçalho

      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
        cells.push(stripTags(cellMatch[1]));
      }

      // Só o formato 2025+: [mês, Residencial|Comercial, valor, %mês, %ano, %12m].
      // Linha "Comercial" (mesmo formato) e o formato antigo (sem essa
      // coluna) são ignorados de propósito — ver docstring acima.
      let vigenciaMonthLabel: string | null = null;
      let valueRaw: string | null = null;
      if (cells.length >= 6 && cells[1].trim().toLowerCase() === "residencial") {
        vigenciaMonthLabel = cells[0];
        valueRaw = cells[2];
      }

      if (!vigenciaMonthLabel || !valueRaw) continue;
      const vigenciaIdx0 = monthIndex0(vigenciaMonthLabel);
      if (vigenciaIdx0 < 0) continue;
      const value = parseValue(valueRaw);
      if (value === null) continue;

      // Traduz do "mês de vigência" (usado por esta fonte) para o "mês
      // base" (convenção já usada no banco) — ver comentário no topo do
      // arquivo.
      let month = vigenciaIdx0; // (vigenciaIdx0 + 1) - 1, já 0-based
      let year = vigenciaYear;
      if (month === 0) {
        month = 12;
        year -= 1;
      }

      if (!result[year]) result[year] = {};
      result[year][month] = value;
    }
  }

  return result;
}

export async function fetchCubScChapecoTable(): Promise<CubScTable> {
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; EGOrcamentos/1.0)" },
  });
  if (!res.ok) {
    throw new Error(`Falha ao buscar CUB/SC no Sinduscon-Chapecó (HTTP ${res.status})`);
  }
  const html = await res.text();
  const table = parseCubScChapecoHtml(html);
  const anyMonthFound = Object.values(table).some((months) => Object.keys(months).length > 0);
  if (!anyMonthFound) {
    throw new Error(
      "Não consegui interpretar a tabela do CUB/SC no Sinduscon-Chapecó (o site pode ter mudado de formato)."
    );
  }
  return table;
}

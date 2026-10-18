// Busca por palavras soltas: cada palavra digitada precisa aparecer no texto, em
// qualquer ordem, sem diferenciar maiúsculas/minúsculas, acentos e pontuação
// (ex.: "te pvc 100" acha "TE, PVC, SÉRIE NORMAL ... DN 100 X 75 MM").
const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function matchesAllWords(query: string, ...fields: Array<string | null | undefined>): boolean {
  const words = norm(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

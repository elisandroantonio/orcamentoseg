import type { ReactNode } from "react";

export const COMPANY_NAME = "EG Projetos e Construções";

/** Logo + nome da empresa + "Diário de Obras" (bloco reutilizado no cabeçalho e nos logins). */
export function DiaryBrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  const logo = size === "lg" ? "h-16" : "h-10";
  const title = size === "lg" ? "text-lg" : "text-[15px]";
  const sub = size === "lg" ? "text-sm" : "text-xs";
  return (
    <div className="flex items-center gap-3 min-w-0">
      <img src="/logo-eg.png" alt="EG" className={`${logo} w-auto shrink-0 object-contain`} />
      <div className="min-w-0 leading-tight">
        <div className={`${title} font-bold text-foreground truncate`}>{COMPANY_NAME}</div>
        <div className={`${sub} font-medium text-primary tracking-wide uppercase`}>Diário de Obras</div>
      </div>
    </div>
  );
}

/**
 * Cabeçalho do app de Diário (campo e cliente): marca à esquerda, ações à
 * direita e, opcionalmente, uma faixa abaixo com a obra selecionada.
 */
export default function DiaryBrandHeader({
  left,
  actions,
  subtitle,
}: {
  /** Ex.: botão de voltar, antes do logo. */
  left?: ReactNode;
  actions?: ReactNode;
  /** Nome da obra / contexto atual. */
  subtitle?: ReactNode;
}) {
  return (
    <header className="bg-background border-b shadow-sm sticky top-0 z-30">
      <div className="h-[3px] bg-primary" />
      <div className="px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          {left}
          <DiaryBrandMark />
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
      {subtitle && (
        <div className="px-4 py-1.5 bg-muted/50 border-t text-xs text-muted-foreground truncate">{subtitle}</div>
      )}
    </header>
  );
}

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";

export type StageOption = { id: number; name: string; parentStageId?: number | null };

/**
 * Seletor de etapa em hierarquia (etapa › sub-etapa › sub-sub-etapa), pensado
 * pro celular: toca na etapa e, se ela tiver filhas, abre o próximo nível.
 * Em qualquer nível dá pra escolher "a própria etapa" ou entrar nas filhas.
 */
export default function StagePicker({
  stages,
  value,
  onChange,
}: {
  stages?: StageOption[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  // Pilha de etapas por onde o usuário já entrou (o último é o nível atual).
  const [path, setPath] = useState<StageOption[]>([]);

  const { byId, childrenOf } = useMemo(() => {
    const byId = new Map<number, StageOption>();
    const childrenOf = new Map<number | null, StageOption[]>();
    for (const s of stages ?? []) byId.set(s.id, s);
    for (const s of stages ?? []) {
      // Pai inexistente (dado inconsistente) vira raiz, pra não "sumir" a etapa.
      const parent = s.parentStageId && byId.has(s.parentStageId) ? s.parentStageId : null;
      const list = childrenOf.get(parent) ?? [];
      list.push(s);
      childrenOf.set(parent, list);
    }
    return { byId, childrenOf };
  }, [stages]);

  const labelFor = (id: number | null) => {
    if (!id) return "Nenhuma";
    const names: string[] = [];
    let cur = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 10) {
      names.unshift(cur.name);
      cur = cur.parentStageId ? byId.get(cur.parentStageId) : undefined;
    }
    return names.length ? names.join(" › ") : "Nenhuma";
  };

  const current = path[path.length - 1] ?? null;
  const items = childrenOf.get(current?.id ?? null) ?? [];

  function openPicker() {
    // Abre já dentro do pai da etapa escolhida, pra facilitar trocar de irmã.
    const trail: StageOption[] = [];
    let cur = value ? byId.get(value) : undefined;
    let guard = 0;
    while (cur?.parentStageId && byId.has(cur.parentStageId) && guard++ < 10) {
      cur = byId.get(cur.parentStageId)!;
      trail.unshift(cur);
    }
    setPath(trail);
    setOpen(true);
  }

  function choose(id: number | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <>
      <Button type="button" variant="outline" className="w-full justify-between h-auto min-h-9 py-2" onClick={openPicker}>
        <span className="text-left whitespace-normal break-words">{labelFor(value)}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Etapa do cronograma</DialogTitle>
          </DialogHeader>

          {path.length > 0 && (
            <div className="space-y-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPath(p => p.slice(0, -1))}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <div className="text-xs text-muted-foreground break-words">{path.map(p => p.name).join(" › ")}</div>
              <Button type="button" variant="secondary" className="w-full justify-start h-auto py-2 whitespace-normal text-left" onClick={() => choose(current!.id)}>
                <Check className="h-4 w-4 mr-2 shrink-0" />
                Usar "{current!.name}" (sem sub-etapa)
              </Button>
            </div>
          )}

          <div className="space-y-1">
            {path.length === 0 && (
              <button
                type="button"
                className="w-full text-left rounded px-3 py-3 text-sm hover:bg-accent flex items-center justify-between"
                onClick={() => choose(null)}
              >
                <span>Nenhuma</span>
                {!value && <Check className="h-4 w-4" />}
              </button>
            )}

            {items.map(s => {
              const hasChildren = (childrenOf.get(s.id)?.length ?? 0) > 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left rounded px-3 py-3 text-sm hover:bg-accent flex items-center justify-between gap-2"
                  onClick={() => (hasChildren ? setPath(p => [...p, s]) : choose(s.id))}
                >
                  <span className="break-words min-w-0">{s.name}</span>
                  {hasChildren ? (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : value === s.id ? (
                    <Check className="h-4 w-4 shrink-0" />
                  ) : null}
                </button>
              );
            })}

            {items.length === 0 && path.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-2">Este orçamento ainda não tem etapas.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

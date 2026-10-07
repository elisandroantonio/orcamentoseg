import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import NewLoginDialog from "@/components/NewLoginDialog";
import { HardHat } from "lucide-react";

/**
 * Gestão dos logins de CAMPO (mestre/encarregado) de um orçamento (obra), dentro
 * da tela do Diário de Obras. Cada login só enxerga e lança no diário deste
 * orçamento — não acessa orçamentos nem outras obras.
 */
export default function FieldDiaryAccessCard({ budgetId }: { budgetId: number }) {
  const utils = trpc.useUtils();
  const { data: logins, isLoading } = trpc.fieldLogins.list.useQuery({ budgetId });

  const [resetTarget, setResetTarget] = useState<{ id: number; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createLogin = trpc.fieldLogins.create.useMutation({
    onSuccess: () => {
      toast.success("Login de campo criado");
      utils.fieldLogins.list.invalidate({ budgetId });
      utils.fieldLogins.listAvailable.invalidate({ budgetId });
    },
    onError: (err) => toast.error(err.message || "Erro ao criar login"),
  });

  const resetPasswordMutation = trpc.fieldLogins.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (err) => toast.error(err.message || "Erro ao redefinir senha"),
  });

  const setActive = trpc.fieldLogins.setActive.useMutation({
    onSuccess: () => utils.fieldLogins.list.invalidate({ budgetId }),
    onError: (err) => toast.error(err.message || "Erro ao atualizar login"),
  });

  // Vincular um mestre que já tem login (de outra obra) a esta obra.
  const { data: available } = trpc.fieldLogins.listAvailable.useQuery({ budgetId });
  const [assignValue, setAssignValue] = useState<string>("");

  const refreshLogins = () => {
    utils.fieldLogins.list.invalidate({ budgetId });
    utils.fieldLogins.listAvailable.invalidate({ budgetId });
  };

  const assign = trpc.fieldLogins.assign.useMutation({
    onSuccess: () => {
      toast.success("Login vinculado a esta obra");
      setAssignValue("");
      refreshLogins();
    },
    onError: (err) => toast.error(err.message || "Erro ao vincular login"),
  });

  const unassign = trpc.fieldLogins.unassign.useMutation({
    onSuccess: () => {
      toast.success("Login removido desta obra");
      refreshLogins();
    },
    onError: (err) => toast.error(err.message || "Erro ao remover vínculo"),
  });

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-2">
          <HardHat className="h-4 w-4" />
          Acesso de campo (mestre/encarregado) — só lança nas obras vinculadas
        </Label>
        <NewLoginDialog
          title="Criar login de campo"
          namePlaceholder="Ex: Mestre João"
          accessPath="/campo/login"
          audience="registrar o Diário de Obras"
          isPending={createLogin.isPending}
          onCreate={async (v) => {
            await createLogin.mutateAsync({ budgetId, username: v.username, email: v.email || undefined, password: v.password, name: v.name || undefined });
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Link de acesso do campo: <span className="font-mono break-all">{typeof window !== "undefined" ? window.location.origin : ""}/campo/login</span>
      </p>

      {!!available?.length && (
        <div className="flex items-center gap-2">
          <Select value={assignValue} onValueChange={setAssignValue}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Vincular mestre que já tem login..." />
            </SelectTrigger>
            <SelectContent>
              {available.map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name || a.username} ({a.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={!assignValue || assign.isPending}
            onClick={() => assign.mutate({ fieldUserId: Number(assignValue), budgetId })}
          >
            Vincular
          </Button>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && (!logins || logins.length === 0) && (
        <p className="text-sm text-muted-foreground">Nenhum login de campo criado ainda para esta obra.</p>
      )}

      {!!logins?.length && (
        <div className="space-y-2">
          {logins.map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
              <div className="min-w-0 break-words">
                <div className="font-medium">{l.name || l.username}</div>
                <div className="text-muted-foreground text-xs">
                  Usuário: {l.username}{l.email ? ` · ${l.email}` : ""}
                  {Number(l.budgetCount) > 1 ? ` · ${l.budgetCount} obras` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={l.isActive ? "default" : "secondary"}>{l.isActive ? "Ativo" : "Inativo"}</Badge>
                <Switch
                  checked={!!l.isActive}
                  onCheckedChange={(checked) => setActive.mutate({ fieldUserId: l.id, isActive: checked })}
                />
                {Number(l.budgetCount) > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={unassign.isPending}
                    onClick={() => unassign.mutate({ fieldUserId: l.id, budgetId })}
                  >
                    Remover daqui
                  </Button>
                )}
                <Dialog
                  open={resetTarget?.id === l.id}
                  onOpenChange={(open) => setResetTarget(open ? { id: l.id, username: l.username } : null)}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost">Redefinir senha</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Redefinir senha — {l.username}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1">
                      <Label htmlFor="field-reset-password">Nova senha</Label>
                      <Input
                        id="field-reset-password"
                        type="text"
                        value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        disabled={resetPassword.length < 6 || resetPasswordMutation.isPending}
                        onClick={() => resetPasswordMutation.mutate({ fieldUserId: l.id, password: resetPassword })}
                      >
                        Salvar nova senha
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

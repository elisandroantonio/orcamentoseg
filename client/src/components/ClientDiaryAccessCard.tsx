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
import { KeyRound } from "lucide-react";

/**
 * Gestão de login do portal do cliente (Diário de Obras), dentro da tela do
 * Projeto. O cliente nunca se autocadastra — a equipe cria o e-mail/senha
 * aqui e passa pro cliente.
 */
export default function ClientDiaryAccessCard({
  clientId,
  budgetId,
  clientName,
}: {
  clientId: number;
  budgetId: number;
  clientName?: string;
}) {
  const utils = trpc.useUtils();
  const { data: logins, isLoading } = trpc.clientLogins.listLogins.useQuery({ clientId, budgetId });
  const { data: available } = trpc.clientLogins.listAvailable.useQuery({ clientId, budgetId });
  const [assignValue, setAssignValue] = useState("");

  const refresh = () => {
    utils.clientLogins.listLogins.invalidate({ clientId, budgetId });
    utils.clientLogins.listAvailable.invalidate({ clientId, budgetId });
  };

  const assign = trpc.clientLogins.assign.useMutation({
    onSuccess: () => {
      toast.success("Login vinculado a esta obra");
      setAssignValue("");
      refresh();
    },
    onError: (err) => toast.error(err.message || "Erro ao vincular login"),
  });

  const unassign = trpc.clientLogins.unassign.useMutation({
    onSuccess: () => {
      toast.success("Login removido desta obra");
      refresh();
    },
    onError: (err) => toast.error(err.message || "Erro ao remover vínculo"),
  });

  const [resetTarget, setResetTarget] = useState<{ id: number; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createLogin = trpc.clientLogins.createLogin.useMutation({
    onSuccess: () => {
      toast.success("Login do cliente criado");
      refresh();
    },
    onError: (err) => toast.error(err.message || "Erro ao criar login"),
  });

  const resetPasswordMutation = trpc.clientLogins.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Senha redefinida");
      setResetTarget(null);
      setResetPassword("");
    },
    onError: (err) => toast.error(err.message || "Erro ao redefinir senha"),
  });

  const setActive = trpc.clientLogins.setActive.useMutation({
    onSuccess: () => refresh(),
    onError: (err) => toast.error(err.message || "Erro ao atualizar login"),
  });

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Acesso do cliente{clientName ? ` (${clientName})` : ""} — vê só as obras vinculadas
        </Label>
        <NewLoginDialog
          title="Criar login do cliente"
          namePlaceholder="Nome do contato"
          accessPath="/portal/login"
          audience="acompanhar o Diário de Obras"
          isPending={createLogin.isPending}
          onCreate={async (v) => {
            await createLogin.mutateAsync({ clientId, budgetId, username: v.username, email: v.email || undefined, password: v.password, name: v.name || undefined });
          }}
        />
      </div>

      {!!available?.length && (
        <div className="flex items-center gap-2">
          <Select value={assignValue} onValueChange={setAssignValue}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Vincular login do cliente já existente..." />
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
            onClick={() => assign.mutate({ clientUserId: Number(assignValue), budgetId })}
          >
            Vincular
          </Button>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && (!logins || logins.length === 0) && (
        <p className="text-sm text-muted-foreground">Nenhum login criado ainda pra este cliente.</p>
      )}

      {!!logins?.length && (
        <div className="space-y-2">
          {logins.map((l: any) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
              <div className="min-w-0 break-words">
                <div className="font-medium">{l.name || l.username}</div>
                <div className="text-muted-foreground text-xs">Usuário: {l.username}{l.email ? ` · ${l.email}` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={l.isActive ? "default" : "secondary"}>{l.isActive ? "Ativo" : "Inativo"}</Badge>
                <Switch
                  checked={!!l.isActive}
                  onCheckedChange={(checked) => setActive.mutate({ clientUserId: l.id, isActive: checked })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={unassign.isPending}
                  onClick={() => unassign.mutate({ clientUserId: l.id, budgetId })}
                >
                  Remover daqui
                </Button>
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
                      <Label htmlFor="reset-password">Nova senha</Label>
                      <Input
                        id="reset-password"
                        type="text"
                        value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        disabled={resetPassword.length < 6 || resetPasswordMutation.isPending}
                        onClick={() => resetPasswordMutation.mutate({ clientUserId: l.id, password: resetPassword })}
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

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
export default function ClientDiaryAccessCard({ clientId, clientName }: { clientId: number; clientName?: string }) {
  const utils = trpc.useUtils();
  const { data: logins, isLoading } = trpc.clientLogins.listLogins.useQuery({ clientId });

  const [resetTarget, setResetTarget] = useState<{ id: number; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createLogin = trpc.clientLogins.createLogin.useMutation({
    onSuccess: () => {
      toast.success("Login do cliente criado");
      utils.clientLogins.listLogins.invalidate({ clientId });
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
    onSuccess: () => utils.clientLogins.listLogins.invalidate({ clientId }),
    onError: (err) => toast.error(err.message || "Erro ao atualizar login"),
  });

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Acesso do cliente{clientName ? ` (${clientName})` : ""} — vê todas as obras dele em execução
        </Label>
        <NewLoginDialog
          title="Criar login do cliente"
          namePlaceholder="Nome do contato"
          accessPath="/portal/login"
          audience="acompanhar o Diário de Obras"
          isPending={createLogin.isPending}
          onCreate={async (v) => {
            await createLogin.mutateAsync({ clientId, username: v.username, email: v.email || undefined, password: v.password, name: v.name || undefined });
          }}
        />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && (!logins || logins.length === 0) && (
        <p className="text-sm text-muted-foreground">Nenhum login criado ainda pra este cliente.</p>
      )}

      {!!logins?.length && (
        <div className="space-y-2">
          {logins.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{l.name || l.username}</div>
                <div className="text-muted-foreground text-xs">Usuário: {l.username}{l.email ? ` · ${l.email}` : ""}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={l.isActive ? "default" : "secondary"}>{l.isActive ? "Ativo" : "Inativo"}</Badge>
                <Switch
                  checked={!!l.isActive}
                  onCheckedChange={(checked) => setActive.mutate({ clientUserId: l.id, isActive: checked })}
                />
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

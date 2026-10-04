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
import { KeyRound, Plus } from "lucide-react";

/**
 * Gestão de login do portal do cliente (Diário de Obras), dentro da tela do
 * Projeto. O cliente nunca se autocadastra — a equipe cria o e-mail/senha
 * aqui e passa pro cliente.
 */
export default function ClientDiaryAccessCard({ clientId, clientName }: { clientId: number; clientName?: string }) {
  const utils = trpc.useUtils();
  const { data: logins, isLoading } = trpc.clientLogins.listLogins.useQuery({ clientId });

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [resetTarget, setResetTarget] = useState<{ id: number; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createLogin = trpc.clientLogins.createLogin.useMutation({
    onSuccess: () => {
      toast.success("Login do cliente criado");
      setCreateOpen(false);
      setEmail("");
      setPassword("");
      setName("");
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
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Novo login
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar login do cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="client-login-name">Nome (opcional)</Label>
                <Input id="client-login-name" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do contato" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="client-login-email">E-mail</Label>
                <Input id="client-login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@email.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="client-login-password">Senha</Label>
                <Input id="client-login-password" type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <p className="text-xs text-muted-foreground">Anote essa senha — ela não aparece de novo depois.</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!email || password.length < 6 || createLogin.isPending}
                onClick={() => createLogin.mutate({ clientId, email, password, name: name || undefined })}
              >
                Criar login
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                <div className="font-medium">{l.name || l.email}</div>
                <div className="text-muted-foreground text-xs">{l.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={l.isActive ? "default" : "secondary"}>{l.isActive ? "Ativo" : "Inativo"}</Badge>
                <Switch
                  checked={!!l.isActive}
                  onCheckedChange={(checked) => setActive.mutate({ clientUserId: l.id, isActive: checked })}
                />
                <Dialog
                  open={resetTarget?.id === l.id}
                  onOpenChange={(open) => setResetTarget(open ? { id: l.id, email: l.email } : null)}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost">Redefinir senha</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Redefinir senha — {l.email}</DialogTitle>
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

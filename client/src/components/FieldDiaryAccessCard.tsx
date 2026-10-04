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
import { HardHat, Plus } from "lucide-react";

/**
 * Gestão dos logins de CAMPO (mestre/encarregado) de um orçamento (obra), dentro
 * da tela do Diário de Obras. Cada login só enxerga e lança no diário deste
 * orçamento — não acessa orçamentos nem outras obras.
 */
export default function FieldDiaryAccessCard({ budgetId }: { budgetId: number }) {
  const utils = trpc.useUtils();
  const { data: logins, isLoading } = trpc.fieldLogins.list.useQuery({ budgetId });

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [resetTarget, setResetTarget] = useState<{ id: number; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const createLogin = trpc.fieldLogins.create.useMutation({
    onSuccess: () => {
      toast.success("Login de campo criado");
      setCreateOpen(false);
      setEmail("");
      setPassword("");
      setName("");
      utils.fieldLogins.list.invalidate({ budgetId });
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

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <HardHat className="h-4 w-4" />
          Acesso de campo (mestre/encarregado) — só lança no diário deste orçamento
        </Label>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Novo login
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar login de campo</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="field-login-name">Nome</Label>
                <Input id="field-login-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Mestre João" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="field-login-email">E-mail</Label>
                <Input id="field-login-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="mestre@email.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="field-login-password">Senha</Label>
                <Input id="field-login-password" type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
                <p className="text-xs text-muted-foreground">Anote essa senha — ela não aparece de novo depois.</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!email || password.length < 6 || createLogin.isPending}
                onClick={() => createLogin.mutate({ budgetId, email, password, name: name || undefined })}
              >
                Criar login
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-xs text-muted-foreground">
        Link de acesso do campo: <span className="font-mono">{typeof window !== "undefined" ? window.location.origin : ""}/campo/login</span>
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && (!logins || logins.length === 0) && (
        <p className="text-sm text-muted-foreground">Nenhum login de campo criado ainda para esta obra.</p>
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
                  onCheckedChange={(checked) => setActive.mutate({ fieldUserId: l.id, isActive: checked })}
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

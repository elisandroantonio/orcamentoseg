import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Mail, Plus } from "lucide-react";

export type NewLoginValues = {
  name: string;
  username: string;
  email: string;
  password: string;
};

/** "João da Silva" -> "joao.da.silva" (sugestão de usuário a partir do nome). */
function suggestUsername(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 50);
}

/**
 * Janela "Novo login" compartilhada (campo e cliente): nome, usuário (login),
 * senha e e-mail OPCIONAL. Depois de criar, mostra a mensagem pronta com
 * link + usuário + senha pra copiar (WhatsApp) ou enviar por e-mail — a senha
 * só aparece nesse momento.
 */
export default function NewLoginDialog({
  title,
  namePlaceholder,
  accessPath,
  audience,
  isPending,
  onCreate,
}: {
  title: string;
  namePlaceholder: string;
  /** Caminho da tela de login, ex.: "/campo/login". */
  accessPath: string;
  /** Texto da mensagem, ex.: "acompanhar o Diário de Obras". */
  audience: string;
  isPending: boolean;
  /** Deve rejeitar (throw) se falhar — a janela fica aberta pra corrigir. */
  onCreate: (values: NewLoginValues) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState<{ message: string; email: string } | null>(null);

  function reset() {
    setName("");
    setUsername("");
    setUsernameTouched(false);
    setEmail("");
    setPassword("");
    setCreated(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleCreate() {
    const values = { name: name.trim(), username: username.trim().toLowerCase(), email: email.trim(), password };
    try {
      await onCreate(values);
    } catch {
      return; // o toast de erro já foi mostrado por quem chamou
    }
    const link = `${window.location.origin}${accessPath}`;
    const message =
      `Acesso para ${audience}:\n` +
      `Link: ${link}\n` +
      `Usuário: ${values.username}\n` +
      `Senha: ${values.password}`;
    setCreated({ message, email: values.email });
  }

  async function copyMessage() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.message);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não consegui copiar — selecione o texto e copie manualmente");
    }
  }

  const canCreate = username.trim().length >= 3 && password.length >= 6 && !isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" /> Novo login
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Login criado" : title}</DialogTitle>
        </DialogHeader>

        {!created ? (
          <>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="new-login-name">Nome</Label>
                <Input
                  id="new-login-name"
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    if (!usernameTouched) setUsername(suggestUsername(e.target.value));
                  }}
                  placeholder={namePlaceholder}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-login-username">Usuário (login)</Label>
                <Input
                  id="new-login-username"
                  value={username}
                  onChange={e => {
                    setUsernameTouched(true);
                    setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""));
                  }}
                  placeholder="ex: joao.silva"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <p className="text-xs text-muted-foreground">Sem espaços ou acentos. Mínimo 3 caracteres.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-login-password">Senha</Label>
                <Input
                  id="new-login-password"
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-login-email">E-mail (opcional)</Label>
                <Input
                  id="new-login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="só se quiser enviar o acesso por e-mail"
                />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!canCreate} onClick={handleCreate}>
                {isPending ? "Criando..." : "Criar login"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Copie e envie agora — a senha não aparece de novo depois.
            </p>
            <Textarea readOnly value={created.message} rows={5} className="font-mono text-sm" />
            <DialogFooter className="gap-2 sm:gap-2">
              {created.email && (
                <Button variant="outline" asChild>
                  <a
                    href={`mailto:${created.email}?subject=${encodeURIComponent("Acesso ao Diário de Obras")}&body=${encodeURIComponent(created.message)}`}
                  >
                    <Mail className="h-4 w-4 mr-1" /> Enviar por e-mail
                  </a>
                </Button>
              )}
              <Button onClick={copyMessage}>
                <Copy className="h-4 w-4 mr-1" /> Copiar mensagem
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

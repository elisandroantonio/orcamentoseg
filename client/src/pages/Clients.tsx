import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ClientFormData {
  name: string;
  documentType: "cpf" | "cnpj";
  document: string;
  address: string;
  zipCode: string;
  email: string;
  phone: string;
  notes: string;
}

export default function Clients() {
  const { data: clients, refetch } = trpc.clients.list.useQuery();
  const createMutation = trpc.clients.create.useMutation();
  const updateMutation = trpc.clients.update.useMutation();
  const deleteMutation = trpc.clients.delete.useMutation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<number | null>(null);
  const [formData, setFormData] = useState<ClientFormData>({
    name: "",
    documentType: "cpf",
    document: "",
    address: "",
    zipCode: "",
    email: "",
    phone: "",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      documentType: "cpf",
      document: "",
      address: "",
      zipCode: "",
      email: "",
      phone: "",
      notes: "",
    });
    setEditingClient(null);
  };

  const handleCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (client: any) => {
    setFormData({
      name: client.name,
      documentType: client.documentType,
      document: client.document,
      address: client.address || "",
      zipCode: client.zipCode || "",
      email: client.email || "",
      phone: client.phone || "",
      notes: client.notes || "",
    });
    setEditingClient(client.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingClient) {
        await updateMutation.mutateAsync({
          id: editingClient,
          ...formData,
        });
        toast.success("Cliente atualizado com sucesso");
      } else {
        await createMutation.mutateAsync(formData);
        toast.success("Cliente criado com sucesso");
      }
      refetch();
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar cliente");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja deletar este cliente?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Cliente deletado com sucesso");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar cliente");
    }
  };

  const formatDocument = (doc: string, type: "cpf" | "cnpj") => {
    if (type === "cpf") {
      return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else {
      return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Clientes</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie os clientes dos seus orçamentos
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / Razão Social</TableHead>
                <TableHead>CPF / CNPJ</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients?.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    {formatDocument(client.document, client.documentType)}
                  </TableCell>
                  <TableCell>{client.email || "-"}</TableCell>
                  <TableCell>{client.phone || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(client)}
                    >
                      <Pencil className="h-4 w-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(client.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!clients || clients.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum cliente cadastrado ainda
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingClient ? "Editar Cliente" : "Novo Cliente"}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados do cliente
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="name">Nome / Razão Social *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="documentType">Tipo de Documento *</Label>
                  <Select
                    value={formData.documentType}
                    onValueChange={(value: "cpf" | "cnpj") =>
                      setFormData({ ...formData, documentType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="document">
                    {formData.documentType === "cpf" ? "CPF" : "CNPJ"} *
                  </Label>
                  <Input
                    id="document"
                    value={formData.document}
                    onChange={(e) =>
                      setFormData({ ...formData, document: e.target.value })
                    }
                    placeholder={
                      formData.documentType === "cpf"
                        ? "000.000.000-00"
                        : "00.000.000/0000-00"
                    }
                    required
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) =>
                      setFormData({ ...formData, zipCode: e.target.value })
                    }
                    placeholder="00000-000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingClient ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

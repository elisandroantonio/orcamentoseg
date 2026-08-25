import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface AddInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (inputId: number, quantity: number) => Promise<void>;
}

export function AddInputDialog({ open, onOpenChange, onAdd }: AddInputDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedInputId, setSelectedInputId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [isAdding, setIsAdding] = useState(false);

  const { data: inputs = [] } = trpc.inputs.search.useQuery(
    { search: searchTerm },
    { enabled: searchTerm.length >= 2 }
  );

  const handleAdd = async () => {
    if (!selectedInputId) return;
    
    setIsAdding(true);
    try {
      await onAdd(selectedInputId, parseFloat(quantity));
      
      // Resetar e fechar
      setSearchTerm("");
      setSelectedInputId(null);
      setQuantity("1");
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao adicionar insumo:", error);
    } finally {
      setIsAdding(false);
    }
  };

  const getTypeBadge = (type: string) => {
    const badges = {
      material: <Badge className="bg-blue-500">Material</Badge>,
      labor: <Badge className="bg-green-500">Mão de Obra</Badge>,
      equipment: <Badge className="bg-orange-500">Equipamento</Badge>,
    };
    return badges[type as keyof typeof badges] || <Badge>{type}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Insumo à Etapa</DialogTitle>
          <DialogDescription>
            Busque e selecione um insumo SINAPI para adicionar
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label>Buscar Insumo</Label>
            <Input
              placeholder="Digite para buscar (mínimo 2 caracteres)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          
          {searchTerm.length >= 2 && (
            <div className="border rounded-md max-h-[300px] overflow-y-auto">
              {inputs && inputs.length > 0 ? (
                <div className="divide-y">
                  {inputs.map((input) => (
                    <div
                      key={input.id}
                      className={cn(
                        "p-3 cursor-pointer hover:bg-slate-50 transition-colors",
                        selectedInputId === input.id && "bg-blue-50"
                      )}
                      onClick={() => setSelectedInputId(input.id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {input.code && (
                          <span className="font-mono text-sm text-slate-600">{input.code}</span>
                        )}
                        {getTypeBadge(input.type)}
                      </div>
                      <div className="font-medium">{input.description}</div>
                      <div className="text-sm text-slate-500 mt-1">
                        {input.unit} | Custo Unitário: R$ {Number(input.unitCost).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-slate-500">
                  Nenhum insumo encontrado
                </div>
              )}
            </div>
          )}
          
          {selectedInputId && (
            <div>
              <Label>Quantidade</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1.000"
              />
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setSelectedInputId(null);
                setQuantity("1");
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!selectedInputId || !quantity || isAdding}
              onClick={handleAdd}
            >
              {isAdding ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

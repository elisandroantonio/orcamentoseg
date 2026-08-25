import { useState } from "react";
import { ChevronDown, ChevronUp, Save, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CompositionInputsExpansionProps {
  compositionId: number;
  budgetItemId?: number;
  quantity: number;
}

interface InputData {
  inputId: number;
  code: string;
  description: string;
  type: string;
  unit: string;
  coefficient: string;
  unitCost: string;
  isCustom?: boolean;
}

export default function CompositionInputsExpansion({
  compositionId,
  budgetItemId,
  quantity,
}: CompositionInputsExpansionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingInputs, setEditingInputs] = useState<Record<number, { coefficient: string; unitCost: string }>>({});

  const { data: inputs, refetch } = trpc.compositions.getInputsWithCustomValues.useQuery(
    { compositionId, budgetItemId },
    { enabled: isExpanded }
  );

  const updateTemporaryMutation = trpc.inputs.updateTemporary.useMutation({
    onSuccess: () => {
      toast.success("Insumo atualizado temporariamente neste orçamento");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const updatePermanentMutation = trpc.inputs.updatePermanent.useMutation({
    onSuccess: () => {
      toast.success("Insumo atualizado permanentemente na base");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const handleEdit = (inputId: number, field: "coefficient" | "unitCost", value: string) => {
    setEditingInputs(prev => ({
      ...prev,
      [inputId]: {
        ...prev[inputId],
        [field]: value,
      },
    }));
  };

  const handleSaveTemporary = (input: InputData) => {
    if (!budgetItemId) {
      toast.error("Salve o orçamento primeiro antes de editar insumos");
      return;
    }

    const edited = editingInputs[input.inputId];
    if (!edited) {
      toast.error("Nenhuma alteração detectada");
      return;
    }

    updateTemporaryMutation.mutate({
      budgetItemId,
      inputId: input.inputId,
      coefficient: edited.coefficient || input.coefficient,
      unitCost: edited.unitCost || input.unitCost,
    });
  };

  const handleSavePermanent = (input: InputData) => {
    const edited = editingInputs[input.inputId];
    if (!edited) {
      toast.error("Nenhuma alteração detectada");
      return;
    }

    // Precisa ter pelo menos unitCost ou coefficient alterado
    if (!edited.unitCost && !edited.coefficient) {
      toast.error("Altere o coeficiente ou custo unitário antes de gravar");
      return;
    }

    updatePermanentMutation.mutate({
      inputId: input.inputId,
      compositionId,
      unitCost: edited.unitCost || input.unitCost,
      coefficient: edited.coefficient || input.coefficient,
    });
  };

  const getInputValue = (input: InputData, field: "coefficient" | "unitCost") => {
    return editingInputs[input.inputId]?.[field] ?? input[field];
  };

  const calculateTotalCost = (input: InputData) => {
    const coef = Number(getInputValue(input, "coefficient"));
    const cost = Number(getInputValue(input, "unitCost"));
    return (coef * cost * quantity).toFixed(2);
  };

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full justify-start gap-2"
      >
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {isExpanded ? "Recolher" : "Expandir"} Insumos
      </Button>

      {isExpanded && inputs && (
        <div className="mt-4 border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Coeficiente</TableHead>
                <TableHead>Custo Unit.</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inputs.map((input: any) => (
                <TableRow key={input.inputId} className={input.isCustom ? "bg-yellow-50" : ""}>
                  <TableCell className="font-mono text-xs">{input.code}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{input.description}</TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-1 rounded bg-gray-100">
                      {input.type === "material" ? "Material" : input.type === "labor" ? "M.O." : "Equip."}
                    </span>
                  </TableCell>
                  <TableCell>{input.unit}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.000001"
                      value={getInputValue(input, "coefficient")}
                      onChange={(e) => handleEdit(input.inputId, "coefficient", e.target.value)}
                      className="w-24 h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={getInputValue(input, "unitCost")}
                      onChange={(e) => handleEdit(input.inputId, "unitCost", e.target.value)}
                      className="w-28 h-8 text-sm"
                    />
                  </TableCell>
                  <TableCell className="font-semibold">
                    R$ {calculateTotalCost(input)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSaveTemporary(input)}
                        disabled={!editingInputs[input.inputId] || updateTemporaryMutation.isPending}
                        title="Salvar apenas neste orçamento"
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleSavePermanent(input)}
                        disabled={!editingInputs[input.inputId]?.unitCost || updatePermanentMutation.isPending}
                        title="Gravar permanentemente na base"
                      >
                        <Database className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {inputs.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              Nenhum insumo cadastrado para esta composição
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


interface AddServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (service: {
    description: string;
    unit: string;
    quantity: number;
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    serviceCost: number;
    otherCost: number;
  }) => void;
  editMode?: boolean;
  initialData?: {
    itemId: number;
    description: string;
    unit: string;
    quantity: number;
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    serviceCost: number;
    otherCost: number;
  };
  onUpdate?: (itemId: number, service: {
    description: string;
    unit: string;
    quantity: number;
    materialCost: number;
    laborCost: number;
    equipmentCost: number;
    serviceCost: number;
    otherCost: number;
  }) => void;
}

// Unidades de medida disponíveis
const UNITS = [
  { value: "UN", label: "Unidade (UN)" },
  { value: "H", label: "Hora (H)" },
  { value: "MÊS", label: "Mês (MÊS)" },
  { value: "M", label: "Metro (M)" },
  { value: "M2", label: "Metro Quadrado (M²)" },
  { value: "M3", label: "Metro Cúbico (M³)" },
  { value: "KG", label: "Quilograma (KG)" },
  { value: "T", label: "Tonelada (T)" },
  { value: "L", label: "Litro (L)" },
  { value: "CJ", label: "Conjunto (CJ)" },
  { value: "VB", label: "Verba (VB)" },
];

export function AddServiceDialog({ open, onOpenChange, onAdd, editMode = false, initialData, onUpdate }: AddServiceDialogProps) {

  const [description, setDescription] = useState(initialData?.description || "");
  const [unit, setUnit] = useState(initialData?.unit || "");
  const [quantity, setQuantity] = useState(initialData?.quantity?.toString() || "");
  const [laborCost, setLaborCost] = useState(initialData?.laborCost?.toString() || "");
  const [materialCost, setMaterialCost] = useState(initialData?.materialCost?.toString() || "");
  const [equipmentCost, setEquipmentCost] = useState(initialData?.equipmentCost?.toString() || "");
  const [serviceCost, setServiceCost] = useState(initialData?.serviceCost?.toString() || "");
  const [otherCost, setOtherCost] = useState(initialData?.otherCost?.toString() || "");

  // Calcular preço unitário e total
  const unitPrice = 
    (parseFloat(laborCost) || 0) +
    (parseFloat(materialCost) || 0) +
    (parseFloat(equipmentCost) || 0) +
    (parseFloat(serviceCost) || 0) +
    (parseFloat(otherCost) || 0);

  const totalPrice = unitPrice * (parseFloat(quantity) || 0);



  // Atualizar estados quando initialData mudar
  useEffect(() => {
    if (initialData) {
      setDescription(initialData.description);
      setUnit(initialData.unit);
      setQuantity(initialData.quantity.toString());
      setLaborCost(initialData.laborCost.toString());
      setMaterialCost(initialData.materialCost.toString());
      setEquipmentCost(initialData.equipmentCost.toString());
      setServiceCost(initialData.serviceCost.toString());
      setOtherCost(initialData.otherCost.toString());
    } else {
      setDescription("");
      setUnit("");
      setQuantity("");
      setLaborCost("");
      setMaterialCost("");
      setEquipmentCost("");
      setServiceCost("");
      setOtherCost("");
    }
  }, [initialData, open]);

  const handleSave = () => {
    if (!description || !unit || !quantity) {
      alert("Preencha os campos obrigatórios: Descrição, Unidade e Quantidade");
      return;
    }

    const serviceData = {
      description,
      unit,
      quantity: parseFloat(quantity),
      materialCost: parseFloat(materialCost) || 0,
      laborCost: parseFloat(laborCost) || 0,
      equipmentCost: parseFloat(equipmentCost) || 0,
      serviceCost: parseFloat(serviceCost) || 0,
      otherCost: parseFloat(otherCost) || 0,
    };

    if (editMode && initialData && onUpdate) {
      onUpdate(initialData.itemId, serviceData);
    } else {
      onAdd(serviceData);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editMode ? "Editar serviço a preço informado" : "Adicionar serviço a preço informado"}</DialogTitle>
        </DialogHeader>

        {/* Descrição */}
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o serviço"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Unidade de medida */}
          <div>
            <Label htmlFor="unit">Unidade de medida</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantidade */}
          <div>
            <Label htmlFor="quantity">Quantidade</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0,00"
            />
          </div>
        </div>

        {/* Valores unitários */}
        <div>
          <Label className="text-base font-semibold">Valores unitários (R$)</Label>
          <div className="grid grid-cols-5 gap-3 mt-2">
            <div>
              <Label htmlFor="laborCost" className="text-sm">Mão de obra</Label>
              <Input
                id="laborCost"
                type="number"
                step="0.01"
                value={laborCost}
                onChange={(e) => setLaborCost(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label htmlFor="materialCost" className="text-sm">Materiais</Label>
              <Input
                id="materialCost"
                type="number"
                step="0.01"
                value={materialCost}
                onChange={(e) => setMaterialCost(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label htmlFor="equipmentCost" className="text-sm">Equipamentos</Label>
              <Input
                id="equipmentCost"
                type="number"
                step="0.01"
                value={equipmentCost}
                onChange={(e) => setEquipmentCost(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label htmlFor="serviceCost" className="text-sm">Serviços</Label>
              <Input
                id="serviceCost"
                type="number"
                step="0.01"
                value={serviceCost}
                onChange={(e) => setServiceCost(e.target.value)}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label htmlFor="otherCost" className="text-sm">Outros</Label>
              <Input
                id="otherCost"
                type="number"
                step="0.01"
                value={otherCost}
                onChange={(e) => setOtherCost(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>
        </div>

        {/* Totais calculados */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <Label className="text-sm text-gray-600">Preço unitário (R$)</Label>
            <div className="text-2xl font-bold text-blue-600">
              R$ {unitPrice.toFixed(2).replace('.', ',')}
            </div>
          </div>

          <div>
            <Label className="text-sm text-gray-600">Total Geral (R$)</Label>
            <div className="text-2xl font-bold text-green-600">
              R$ {totalPrice.toFixed(2).replace('.', ',')}
            </div>
          </div>
        </div>

        {/* Botão Salvar */}
        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} className="w-full">
            ✓ Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

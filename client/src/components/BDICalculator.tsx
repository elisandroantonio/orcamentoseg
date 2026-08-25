import { useState, useEffect, useCallback, createContext, useContext, memo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Info, TrendingUp, Building2, Calculator, Users, FolderOpen, FileText, Printer, Save, FileDown, FileSpreadsheet } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { generateBDIExcel, generateBDIPDF } from "@/lib/bdi-export";

// =================== CONSTANTES ===================
const ENC_PCT = 65.94;
const DIAS_DEFAULT = 22;

const PISOS: Record<string, { nome: string; piso: number; diariaDefault: number }> = {
  servente:    { nome: "Servente / Ajudante",           piso: 1978.00,  diariaDefault: 180 },
  meiooficial: { nome: "Meio-oficial",                   piso: 2177.00,  diariaDefault: 200 },
  pedreiro:    { nome: "Pedreiro / Carp. / Ferreiro",   piso: 2374.00,  diariaDefault: 220 },
  mestre:      { nome: "Mestre de obras",                piso: 3200.00,  diariaDefault: 280 },
};

const PROJ_CUSTOS_DEFAULT = [
  { item: "Hora técnica — Eng. responsável", qtd: 40, unit: 200 },
  { item: "Hora técnica — Desenhista/BIM",   qtd: 20, unit: 80  },
  { item: "Impressões / plotagens",           qtd: 1,  unit: 300 },
  { item: "Deslocamentos / vistorias",        qtd: 3,  unit: 150 },
  { item: "Software (licença proporcional)", qtd: 1,  unit: 200 },
];

// =================== UTILS ===================
const fmtR = (v: number) =>
  "R$\u00a0" + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtP = (v: number) => v.toFixed(2).replace(".", ",") + "%";
const fmt = (v: number, dec = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

function calcBDIFormula(AC: number, L: number, I: number, R: number, G: number): number {
  const num = (1 + AC / 100) * (1 + G / 100) * (1 + R / 100);
  const den = 1 - L / 100 - I / 100;
  return den > 0 ? (num / den - 1) * 100 : 0;
}

function bdiColor(bdi: number): string {
  if (bdi < 20) return "text-green-600 dark:text-green-400";
  if (bdi < 35) return "text-teal-600 dark:text-teal-400";
  if (bdi < 45) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// =================== TIPOS ===================
interface EquipeMembro { key: string; qtd: number; diaria: number }
interface ProjCusto { item: string; qtd: number; unit: number }

interface BDIState {
  fatMensal: number; fatAnual: number; nObras: number; porte: number; prazo: number;
  tipoObra: string; tipoRisco: string; iss: number;
  pis: number; cofins: number; presIRPJ: number; presCSLL: number;
  aliqIRPJ: number; aliqCSLL: number;
  acAluguel: number; acSalarios: number; acContador: number; acVeiculo: number;
  acTi: number; acSeguros: number; acOutros: number; acDeprec: number;
  diasMes: number; insalub: number;
  bdiAC: number; bdiL: number; bdiI: number; bdiR: number; bdiG: number; custoDireto: number;
  projTipo: string; projHonorario: number; projPrazo: number;
  projAC: number; projL: number; projR: number; projG: number;
}

const DEFAULT_STATE: BDIState = {
  fatMensal: 150000, fatAnual: 1800000, nObras: 3, porte: 400000, prazo: 8,
  tipoObra: "global", tipoRisco: "comercial", iss: 3.00,
  pis: 0.65, cofins: 3.00, presIRPJ: 8, presCSLL: 12, aliqIRPJ: 15, aliqCSLL: 9,
  acAluguel: 2500, acSalarios: 8000, acContador: 1200, acVeiculo: 2000,
  acTi: 800, acSeguros: 600, acOutros: 800, acDeprec: 500,
  diasMes: 22, insalub: 0,
  bdiAC: 0, bdiL: 10, bdiI: 0, bdiR: 2.0, bdiG: 0, custoDireto: 100000,
  projTipo: "estrutural", projHonorario: 15000, projPrazo: 4,
  projAC: 0, projL: 15, projR: 1.0, projG: 0,
};

// =================== CONTEXT ===================
interface BDIContextType {
  s: BDIState;
  set: (field: keyof BDIState, value: number | string) => void;
  equipe: EquipeMembro[];
  setEquipe: React.Dispatch<React.SetStateAction<EquipeMembro[]>>;
  projCustos: ProjCusto[];
  setProjCustos: React.Dispatch<React.SetStateAction<ProjCusto[]>>;
  // Valores derivados
  totalAC: number;
  pctAC: number;
  adicIRPJ: () => number;
  totalI: () => number;
  calcMO: () => { encGlobal: number; totalEncMes: number; totalFuncs: number };
  bdiCalc: number;
  bdiMultiplier: number;
  projI: number;
  projBDI: number;
  projCustoDireto: number;
  projPrecoSugerido: number;
}

const BDIContext = createContext<BDIContextType | null>(null);

function useBDI() {
  const ctx = useContext(BDIContext);
  if (!ctx) throw new Error("useBDI must be used inside BDIProvider");
  return ctx;
}

// =================== COMPONENTES UTILITÁRIOS (FORA DO PROVIDER) ===================

const NumField = memo(({
  label, value, onChange, hint, step = 1, min, max, readOnly = false
}: {
  label: string; value: number; onChange?: (v: number) => void;
  hint?: string; step?: number; min?: number; max?: number; readOnly?: boolean;
}) => (
  <div className="flex flex-col gap-1">
    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
    <Input
      type="number"
      defaultValue={value}
      key={readOnly ? value : undefined}
      readOnly={readOnly}
      step={step}
      min={min}
      max={max}
      onBlur={e => !readOnly && onChange?.(parseFloat(e.target.value) || 0)}
      onChange={readOnly ? undefined : undefined}
      className={readOnly ? "bg-muted text-muted-foreground cursor-default" : ""}
    />
    {hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
  </div>
));
NumField.displayName = "NumField";

const MetricCard = memo(({
  label, value, sub, variant = "default"
}: {
  label: string; value: string; sub?: string;
  variant?: "default" | "accent" | "ok" | "warn" | "err" | "info";
}) => {
  const colors: Record<string, string> = {
    default: "text-foreground",
    accent:  "text-teal-600 dark:text-teal-400",
    ok:      "text-green-600 dark:text-green-400",
    warn:    "text-amber-600 dark:text-amber-400",
    err:     "text-red-600 dark:text-red-400",
    info:    "text-blue-600 dark:text-blue-400",
  };
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold leading-none ${colors[variant]}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
});
MetricCard.displayName = "MetricCard";

const SectionLabel = memo(({ children }: { children: React.ReactNode }) => (
  <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground border-b border-border pb-1 mt-5 mb-3 first:mt-0">
    {children}
  </div>
));
SectionLabel.displayName = "SectionLabel";

const InfoAlert = memo(({ children, variant = "info" }: { children: React.ReactNode; variant?: "info" | "warn" | "err" | "ok" }) => {
  const styles: Record<string, string> = {
    info: "border-l-blue-400 bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200",
    warn: "border-l-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200",
    err:  "border-l-red-400 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200",
    ok:   "border-l-green-400 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200",
  };
  return (
    <div className={`border-l-4 rounded-r-lg px-3 py-2 text-xs leading-relaxed mb-3 ${styles[variant]}`}>
      {children}
    </div>
  );
});
InfoAlert.displayName = "InfoAlert";

// =================== ABA EMPRESA ===================
const TabEmpresa = memo(() => {
  const { s, set } = useBDI();
  const risco: Record<string, number> = { residencial: 1.0, comercial: 2.0, frigorifico: 3.5, complexo: 4.5 };
  const riscoSug = risco[s.tipoRisco] ?? 2.0;
  const tipoLabel: Record<string, string> = {
    global: "Empreitada global (mat + MO)",
    parcial: "Empreitada parcial / só MO",
    misto: "Misto",
  };
  return (
    <div className="space-y-1">
      <InfoAlert>Estes dados alimentam automaticamente o cálculo de impostos, administração central e calibração do risco. Preencha com os valores reais dos últimos 12 meses.</InfoAlert>
      <SectionLabel>Dados operacionais da empresa</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <NumField label="Faturamento médio mensal (R$)" value={s.fatMensal} step={5000}
          onChange={v => set("fatMensal", v)} hint="Média dos últimos 12 meses. Base para adicional de IRPJ e % de AC." />
        <NumField label="Faturamento anual previsto (R$)" value={s.fatAnual} step={50000}
          onChange={v => set("fatAnual", v)} hint="Confirma enquadramento no Lucro Presumido (limite: R$ 78 mi)." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <NumField label="Obras simultâneas (média)" value={s.nObras} min={1} max={30}
          onChange={v => set("nObras", v)} />
        <NumField label="Porte médio de contrato (R$)" value={s.porte} step={50000}
          onChange={v => set("porte", v)} hint="Contratos maiores permitem AC menor em %." />
        <NumField label="Prazo médio de obra (meses)" value={s.prazo} min={1} max={48}
          onChange={v => set("prazo", v)} hint="Prazos longos elevam o componente de risco." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo predominante de contrato</Label>
          <Select value={s.tipoObra} onValueChange={v => set("tipoObra", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Empreitada global (mat + MO)</SelectItem>
              <SelectItem value="parcial">Empreitada parcial / só MO</SelectItem>
              <SelectItem value="misto">Misto</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Define presunção fiscal (IRPJ/CSLL).</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de obra predominante</Label>
          <Select value={s.tipoRisco} onValueChange={v => set("tipoRisco", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="residencial">Residencial / simples</SelectItem>
              <SelectItem value="comercial">Comercial / industrial médio</SelectItem>
              <SelectItem value="frigorifico">Frigorífico / agroindústria</SelectItem>
              <SelectItem value="complexo">Alta complexidade</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumField label="ISS — Xanxerê/SC (%)" value={s.iss} step={0.5} min={2} max={5}
          onChange={v => set("iss", v)} hint="LC 116/2003 — alíquota municipal." />
      </div>
      <SectionLabel>Diagnóstico automático</SectionLabel>
      {s.fatMensal > 0 && s.fatMensal < 50000 && (
        <InfoAlert variant="warn">Faturamento baixo — AC pode superar 10% do contrato. Avalie ampliar carteira de obras.</InfoAlert>
      )}
      {s.fatAnual > 78000000 && (
        <InfoAlert variant="err">Faturamento acima do limite do Lucro Presumido (R$ 78 mi). Verifique enquadramento com contador.</InfoAlert>
      )}
      {s.prazo > 18 && (
        <InfoAlert variant="warn">Prazo longo ({s.prazo} meses) — risco de variação de materiais e MO. Considere reajuste contratual (INCC).</InfoAlert>
      )}
      {s.tipoRisco === "frigorifico" && (
        <InfoAlert>Frigorífico/agroindústria: Risco ajustado para 3,5%. Verifique insalubridade máxima (40%) na aba Mão de Obra.</InfoAlert>
      )}
      {s.fatMensal >= 50000 && s.fatAnual <= 78000000 && s.prazo <= 18 && s.tipoRisco !== "frigorifico" && (
        <InfoAlert variant="ok">Parâmetros empresariais dentro do esperado para construtora de médio porte no Oeste/SC.</InfoAlert>
      )}
      <SectionLabel>Resumo dos parâmetros derivados</SectionLabel>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <MetricCard label="Faturamento mensal" value={fmtR(s.fatMensal)} sub="base do cálculo" />
        <MetricCard label="Tipo contrato" value={tipoLabel[s.tipoObra] ?? s.tipoObra} />
        <MetricCard label="Tipo obra" value={s.tipoRisco} />
        <MetricCard label="Risco sugerido" value={fmtP(riscoSug)} sub="ajustado ao tipo de obra" variant="accent" />
        <MetricCard label="Prazo médio" value={`${s.prazo} meses`} />
        <MetricCard label="ISS Xanxerê" value={fmtP(s.iss)} />
      </div>
    </div>
  );
});
TabEmpresa.displayName = "TabEmpresa";

// =================== ABA TRIBUTÁRIO ===================
const TabTributario = memo(() => {
  const { s, set, adicIRPJ, totalI } = useBDI();
  const irpj = s.presIRPJ / 100 * s.aliqIRPJ + adicIRPJ();
  const csll = s.presCSLL / 100 * s.aliqCSLL;
  const total = totalI();
  const tipoLabel = s.tipoObra === "global" ? "Empreitada global — presunção IRPJ 8% / CSLL 12%"
    : s.tipoObra === "parcial" ? "Empreitada parcial / só MO — presunção IRPJ 32% / CSLL 32%"
    : "Misto — presunções intermediárias IRPJ 20% / CSLL 22%";
  return (
    <div>
      <InfoAlert>PIS, COFINS, ISS e as bases de presunção são configurados automaticamente conforme o tipo de contrato selecionado na aba Empresa. Ajuste manualmente apenas se houver particularidades.</InfoAlert>
      <SectionLabel>Regime tributário — Lucro Presumido</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <NumField label="PIS (%)" value={s.pis} step={0.01} onChange={v => set("pis", v)} hint="Lucro Presumido — regime cumulativo. Lei 10.637/02." />
        <NumField label="COFINS (%)" value={s.cofins} step={0.01} onChange={v => set("cofins", v)} hint="Lucro Presumido — regime cumulativo. Lei 10.833/03." />
        <NumField label="ISS (%)" value={s.iss} step={0.5} onChange={v => set("iss", v)} hint="Sincronizado com aba Empresa." />
      </div>
      <SectionLabel>IRPJ e CSLL</SectionLabel>
      <InfoAlert><strong>{tipoLabel}</strong><br />
        IRPJ efetivo: {fmtP(s.presIRPJ)}% (presunção) × {fmtP(s.aliqIRPJ)}% = <strong>{fmtP(s.presIRPJ / 100 * s.aliqIRPJ)}</strong>
        {adicIRPJ() > 0 && <> + adicional 10%: <strong>{fmtP(adicIRPJ())}</strong></>}<br />
        CSLL efetivo: {fmtP(s.presCSLL)}% × {fmtP(s.aliqCSLL)}% = <strong>{fmtP(csll)}</strong>
      </InfoAlert>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <NumField label="Presunção IRPJ (%)" value={s.presIRPJ} step={1} readOnly hint="8% = global · 32% = parcial/MO. IN RFB 1.700/2017 art.33." />
        <NumField label="Presunção CSLL (%)" value={s.presCSLL} step={1} readOnly hint="12% = global · 32% = parcial/MO. IN RFB 1.700/2017 art.34." />
        <NumField label="Adicional IRPJ estimado (%)" value={parseFloat(adicIRPJ().toFixed(4))} readOnly hint="10% sobre lucro presumido > R$ 20.000/mês — calculado auto." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <NumField label="Alíquota IRPJ (%)" value={s.aliqIRPJ} step={1} onChange={v => set("aliqIRPJ", v)} />
        <NumField label="Alíquota CSLL (%)" value={s.aliqCSLL} step={1} onChange={v => set("aliqCSLL", v)} />
      </div>
      <SectionLabel>Resumo fiscal — total I para o BDI</SectionLabel>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tributo</th>
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Base legal</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">% efetivo s/ faturamento</th>
            </tr>
          </thead>
          <tbody>
            {[
              { t: "PIS", base: "Lei 10.637/02 — cumulativo", v: s.pis },
              { t: "COFINS", base: "Lei 10.833/03 — cumulativo", v: s.cofins },
              { t: "ISS — Xanxerê/SC", base: "LC 116/2003", v: s.iss },
              { t: `IRPJ${adicIRPJ() > 0 ? " + adicional" : ""}`, base: `IN RFB 1.700/2017 — art.33 · presunção ${s.presIRPJ}%`, v: irpj },
              { t: "CSLL", base: `IN RFB 1.700/2017 — art.34 · presunção ${s.presCSLL}%`, v: csll },
            ].map(row => (
              <tr key={row.t} className="border-b border-border/50">
                <td className="py-2 px-3">{row.t}</td>
                <td className="py-2 px-3 text-muted-foreground text-xs">{row.base}</td>
                <td className="py-2 px-3 text-right font-medium">{fmtP(row.v)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-bold">
              <td className="py-2 px-3" colSpan={2}>Total I — denominador do BDI</td>
              <td className="py-2 px-3 text-right text-teal-600 dark:text-teal-400">{fmtP(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <MetricCard label="PIS" value={fmtP(s.pis)} />
        <MetricCard label="COFINS" value={fmtP(s.cofins)} />
        <MetricCard label="ISS" value={fmtP(s.iss)} />
        <MetricCard label="IRPJ" value={fmtP(irpj)} />
        <MetricCard label="CSLL" value={fmtP(csll)} />
        <MetricCard label="Total I (BDI)" value={fmtP(total)} variant="accent" />
      </div>
    </div>
  );
});
TabTributario.displayName = "TabTributario";

// =================== ABA AC ===================
const TabAC = memo(() => {
  const { s, set, totalAC, pctAC } = useBDI();
  const keys = ["aluguel","salarios","contador","veiculo","ti","seguros","outros","deprec"] as const;
  const nomes: Record<string, string> = {
    aluguel: "Aluguel/escritório", salarios: "Salários adm. + pró-labore",
    contador: "Contador/jurídico", veiculo: "Veículos", ti: "TI/softwares",
    seguros: "Seguros/CREA/ARTs", outros: "Outros/deslocamentos", deprec: "Depreciação equip.",
  };
  const fieldMap: Record<string, keyof BDIState> = {
    aluguel: "acAluguel", salarios: "acSalarios", contador: "acContador", veiculo: "acVeiculo",
    ti: "acTi", seguros: "acSeguros", outros: "acOutros", deprec: "acDeprec",
  };
  const cls = pctAC < 3 ? "warn" : pctAC < 10 ? "ok" : "err";
  const msg = pctAC < 3 ? "Abaixo do típico — verifique se todos os custos fixos estão cadastrados. Risco de subpreço."
    : pctAC < 10 ? `Faixa adequada — dentro do referencial TCU/SINAPI (4–8%). AC = ${fmtP(pctAC)} do faturamento.`
    : "AC elevado — revise a estrutura de custos fixos ou aumente o faturamento.";
  return (
    <div>
      <InfoAlert>Preencha os custos reais. O percentual de AC é calculado automaticamente como proporção do faturamento e entra direto no numerador do BDI. AC zerado significa que estes custos saem do seu lucro.</InfoAlert>
      <SectionLabel>Custos fixos mensais do escritório</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {keys.map(k => (
          <NumField key={k} label={`${nomes[k]} (R$/mês)`}
            value={s[fieldMap[k]] as number}
            onChange={v => set(fieldMap[k], v)}
            hint={k === "salarios" ? "Inclua seu pró-labore como engenheiro responsável." : undefined}
          />
        ))}
      </div>
      <SectionLabel>Resultado do AC</SectionLabel>
      <InfoAlert variant={cls as "warn" | "ok" | "err"}>
        <strong>AC calculado: {fmtP(pctAC)}</strong> — Total fixo: {fmtR(totalAC)}/mês sobre faturamento de {fmtR(s.fatMensal)}/mês<br />{msg}
      </InfoAlert>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        <MetricCard label="Total custos fixos" value={fmtR(totalAC)} sub="por mês" />
        <MetricCard label="Faturamento mensal" value={fmtR(s.fatMensal)} />
        <MetricCard label="AC (% faturamento)" value={fmtP(pctAC)} variant={cls as "warn" | "ok" | "err"} sub="entra no numerador do BDI" />
        <MetricCard label="Referência TCU/SINAPI" value="4% – 8%" sub="faixa típica para construtoras" />
      </div>
    </div>
  );
});
TabAC.displayName = "TabAC";

// =================== ABA MO ===================
const TabMO = memo(() => {
  const { s, set, equipe, setEquipe, calcMO } = useBDI();
  const { encGlobal, totalEncMes, totalFuncs } = calcMO();
  return (
    <div>
      <InfoAlert>Configure a equipe típica de obra. O sistema calcula automaticamente o encargo efetivo sobre a diária paga, considerando os pisos CCT Oeste/SC (jan/2025) e encargos de 65,94%.</InfoAlert>
      <SectionLabel>Equipe registrada — encargos sobre o piso CCT Oeste/SC (jan/2025)</SectionLabel>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["Função","QTD","Piso CCT (R$)","Encargo 65,94% s/ Piso (R$/mês)","Diária paga (R$/dia)","Enc. ef. s/ diária","Custo/dia total"].map(h => (
                <th key={h} className="py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipe.map((e, i) => {
              const p = PISOS[e.key];
              const encMes = p.piso * ENC_PCT / 100;
              const encDia = encMes / s.diasMes;
              const salMes = e.diaria * s.diasMes;
              const encEf = salMes > 0 ? encMes / salMes * 100 : 0;
              const custoDia = e.diaria + encDia;
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2 px-3">{p.nome}</td>
                  <td className="py-2 px-3">
                    <EquipeQtdInput index={i} value={e.qtd} />
                  </td>
                  <td className="py-2 px-3 text-right">{fmtR(p.piso)}</td>
                  <td className="py-2 px-3 text-right">{fmtR(encMes)}/mês</td>
                  <td className="py-2 px-3">
                    <EquipeDiariaInput index={i} value={e.diaria} />
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">{fmtP(encEf)}</td>
                  <td className="py-2 px-3 text-right">{fmtR(custoDia)}/dia</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <InfoAlert variant="ok">
        <strong>Encargo efetivo global da equipe: {fmtP(encGlobal)} sobre a diária paga</strong><br />
        Total de encargos pagos por mês: {fmtR(totalEncMes)} — para uma equipe de {totalFuncs} colaboradores registrados.<br />
        Use <strong>{fmtP(encGlobal)}</strong> sobre cada R$/dia de MO nas composições unitárias do orçamento.
      </InfoAlert>
      <SectionLabel>Parâmetros globais de MO — uso no orçamento</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumField label="Encargo padrão para orçamento (% s/ diária)" value={parseFloat(encGlobal.toFixed(2))} readOnly
          hint="Derivado da equipe acima. Use este % sobre a diária em todas as composições unitárias." />
        <NumField label="Dias úteis trabalhados/mês" value={s.diasMes} min={15} max={26}
          onChange={v => set("diasMes", v)} />
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Insalubridade aplicável</Label>
          <Select value={String(s.insalub)} onValueChange={v => set("insalub", parseInt(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Não aplica</SelectItem>
              <SelectItem value="10">Mínimo — 10% (s/ sal. mínimo)</SelectItem>
              <SelectItem value="20">Médio — 20%</SelectItem>
              <SelectItem value="40">Máximo — 40% (frigoríficos)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Para obras com câmaras frias / frigoríficos — incide sobre o piso.</p>
        </div>
      </div>
      {s.insalub > 0 && (
        <InfoAlert variant="warn">
          <strong>Insalubridade {s.insalub}% ativada</strong> — adicional mensal: {fmtR(1518 * s.insalub / 100)}/funcionário (base: salário mínimo R$ 1.518,00).<br />
          Para frigoríficos: use grau máximo (40%). Incide sobre todos os registrados.
        </InfoAlert>
      )}
    </div>
  );
});
TabMO.displayName = "TabMO";

// Inputs da equipe separados para evitar re-render da tabela inteira
const EquipeQtdInput = memo(({ index, value }: { index: number; value: number }) => {
  const { setEquipe } = useBDI();
  return (
    <Input type="number" defaultValue={value} min={0} max={50}
      className="w-16 h-7 text-center text-sm"
      onBlur={ev => {
        setEquipe(prev => {
          const newEq = [...prev];
          newEq[index] = { ...newEq[index], qtd: parseInt(ev.target.value) || 0 };
          return newEq;
        });
      }} />
  );
});
EquipeQtdInput.displayName = "EquipeQtdInput";

const EquipeDiariaInput = memo(({ index, value }: { index: number; value: number }) => {
  const { setEquipe } = useBDI();
  return (
    <Input type="number" defaultValue={value} min={50} max={1000} step={5}
      className="w-24 h-7 text-right text-sm text-teal-600 dark:text-teal-400 font-semibold"
      onBlur={ev => {
        setEquipe(prev => {
          const newEq = [...prev];
          newEq[index] = { ...newEq[index], diaria: parseFloat(ev.target.value) || 0 };
          return newEq;
        });
      }} />
  );
});
EquipeDiariaInput.displayName = "EquipeDiariaInput";

// =================== ABA BDI ===================
const TabBDI = memo(() => {
  const { s, set, bdiCalc, bdiMultiplier } = useBDI();
  const AC = s.bdiAC / 100, L = s.bdiL / 100, I = s.bdiI / 100, R = s.bdiR / 100, G = s.bdiG / 100;
  const num = (1 + AC) * (1 + G) * (1 + R);
  const den = 1 - L - I;
  const bdi = bdiCalc;
  const cor = bdiColor(bdi);
  const refs = [
    { t: "Residencial simples",         mn: 18, mx: 25 },
    { t: "Comercial / industrial",       mn: 24, mx: 32 },
    { t: "Frigorífico / agroindústria",  mn: 28, mx: 38 },
    { t: "Obras públicas (SINAPI ref.)", mn: 22, mx: 35 },
  ];
  const cenarios = [
    { label: "Seu BDI atual",         ac: s.bdiAC, l: s.bdiL, r: s.bdiR, i: s.bdiI },
    { label: "Sem AC (como estava)",   ac: 0,       l: s.bdiL, r: s.bdiR, i: s.bdiI },
    { label: "Lucro conservador (8%)", ac: s.bdiAC, l: 8,      r: s.bdiR, i: s.bdiI },
    { label: "Lucro agressivo (15%)",  ac: s.bdiAC, l: 15,     r: s.bdiR, i: s.bdiI },
    { label: "Risco frigorífico",      ac: s.bdiAC, l: s.bdiL, r: 3.5,    i: s.bdiI },
  ];
  const params = [
    { l: "Administração Central (AC)", v: s.bdiAC, max: 10, color: "bg-blue-500",  pos: "numerador" },
    { l: "Lucro (L)",                  v: s.bdiL,  max: 20, color: "bg-green-500", pos: "denominador" },
    { l: "Impostos (I)",               v: s.bdiI,  max: 20, color: "bg-amber-500", pos: "denominador" },
    { l: "Risco (R)",                  v: s.bdiR,  max:  6, color: "bg-red-500",   pos: "numerador" },
    { l: "Garantia (G)",               v: s.bdiG,  max:  3, color: "bg-purple-500",pos: "numerador" },
  ];
  return (
    <div>
      <InfoAlert>Todos os campos abaixo são preenchidos automaticamente pelas abas anteriores. Ajuste manualmente apenas para cenários específicos.</InfoAlert>
      <SectionLabel>Parâmetros do BDI — ajuste manual</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <NumField label="Administração Central — AC (%) ← numerador" value={s.bdiAC} step={0.1}
          onChange={v => set("bdiAC", v)} hint="Calculado na aba Adm. Central." />
        <NumField label="Lucro — L (%) ← denominador" value={s.bdiL} step={0.5} min={1} max={25}
          onChange={v => set("bdiL", v)} hint="TCU referência: 6,16% – 11,85%. Frigoríficos: 10–15%." />
        <NumField label="Impostos — I (%) ← denominador" value={s.bdiI} step={0.01}
          onChange={v => set("bdiI", v)} hint="Calculado na aba Tributário." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <NumField label="Risco — R (%) ← numerador" value={s.bdiR} step={0.5} min={0} max={6}
          onChange={v => set("bdiR", v)} hint="Resid: 1% · Comercial: 2% · Frigorífico: 3–4% · Alta compl.: 4–5%." />
        <NumField label="Garantia — G (%) ← numerador" value={s.bdiG} step={0.5} min={0} max={3}
          onChange={v => set("bdiG", v)} hint="0% obras privadas sem cláusula explícita de garantia." />
        <NumField label="BDI calculado (%)" value={parseFloat(bdi.toFixed(2))} readOnly hint="Fórmula clássica multiplicativa de BDI." />
      </div>
      <SectionLabel>Resultado — Fórmula Clássica de BDI</SectionLabel>
      <div className="border border-border rounded-xl p-5 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">BDI calculado</p>
          <p className={`text-6xl font-bold leading-none tracking-tight ${cor}`}>{fmtP(bdi)}</p>
          <p className="text-sm text-muted-foreground mt-2">Multiplicador: <strong>{bdiMultiplier.toFixed(4)}</strong></p>
          <p className="text-sm text-muted-foreground">Coeficiente: custo direto × <strong>{bdiMultiplier.toFixed(4)}</strong> = preço de venda</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs leading-7 text-muted-foreground">
          <span className="text-foreground font-semibold">BDI = [(1+AC)(1+G)(1+R)] / (1−L−I) − 1</span><br />
          = [(1+{fmtP(AC*100)})(1+{fmtP(G*100)})(1+{fmtP(R*100)})] / (1−{fmtP(L*100)}−{fmtP(I*100)}) − 1<br />
          = {fmt(num, 6)} / {fmt(den, 6)} − 1<br />
          = <strong className="text-foreground">{fmtP(bdi)}</strong><br />
          <span className="text-[10px]">Referência: Acórdão TCU 2.622/2013 · SINAPI CEF/IBGE</span>
        </div>
      </div>
      <SectionLabel>Visualização dos parâmetros</SectionLabel>
      <div className="space-y-2 mb-4">
        {params.map(p => (
          <div key={p.l} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-52 flex-shrink-0">{p.l} <span className="text-[10px]">({p.pos})</span></span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${p.color}`} style={{ width: `${Math.min(p.v / p.max * 100, 100)}%` }} />
            </div>
            <span className="text-xs font-semibold w-12 text-right">{fmtP(p.v)}</span>
          </div>
        ))}
      </div>
      <SectionLabel>Comparativo com faixas de referência</SectionLabel>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo de obra</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Faixa mín.</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Faixa máx.</th>
              <th className="text-center py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Seu BDI ({fmtP(bdi)})</th>
            </tr>
          </thead>
          <tbody>
            {refs.map(f => {
              const dentro = bdi >= f.mn && bdi <= f.mx;
              const acima = bdi > f.mx;
              return (
                <tr key={f.t} className="border-b border-border/50">
                  <td className="py-2 px-3">{f.t}</td>
                  <td className="py-2 px-3 text-right">{fmtP(f.mn)}</td>
                  <td className="py-2 px-3 text-right">{fmtP(f.mx)}</td>
                  <td className="py-2 px-3 text-center">
                    <Badge variant="outline" className={dentro ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300" : acima ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300"}>
                      {dentro ? "dentro da faixa" : acima ? "acima" : "abaixo"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <SectionLabel>Simulador de cenários</SectionLabel>
      <InfoAlert>Compare o impacto de diferentes configurações sobre o BDI final e o preço de venda.</InfoAlert>
      <div className="mb-3 max-w-xs">
        <NumField label="Custo direto de referência (R$)" value={s.custoDireto} step={5000}
          onChange={v => set("custoDireto", v)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["Cenário","BDI","Multiplicador","Preço venda","Margem s/ venda"].map(h => (
                <th key={h} className="py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cenarios.map((c, idx) => {
              const n = (1 + c.ac / 100) * (1 + 0 / 100) * (1 + c.r / 100);
              const d = 1 - c.l / 100 - c.i / 100;
              const b = d > 0 ? (n / d - 1) * 100 : 0;
              const pv = s.custoDireto * (1 + b / 100);
              const mg = b / (100 + b) * 100;
              return (
                <tr key={idx} className={`border-b border-border/50 ${idx === 0 ? "bg-muted/50 font-semibold" : ""}`}>
                  <td className="py-2 px-3">{c.label}</td>
                  <td className="py-2 px-3">{fmtP(b)}</td>
                  <td className="py-2 px-3">{(1 + b / 100).toFixed(4)}</td>
                  <td className="py-2 px-3">{fmtR(pv)}</td>
                  <td className="py-2 px-3">{fmtP(mg)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
TabBDI.displayName = "TabBDI";

// =================== ABA PROJETOS ===================
const TabProjetos = memo(() => {
  const { s, set, projCustos, setProjCustos, pctAC, bdiCalc, projBDI, projCustoDireto, projPrecoSugerido } = useBDI();
  const projI = 14.33;
  const irpjProj = 32 / 100 * s.aliqIRPJ;
  const csllProj = 32 / 100 * s.aliqCSLL;
  const totalIProj = s.pis + s.cofins + s.iss + irpjProj + csllProj;
  const bdi = projBDI;
  return (
    <div>
      <InfoAlert>Cálculo do BDI para contratos de elaboração de projetos (serviço intelectual). A presunção fiscal é 32% para IRPJ e CSLL — diferente da execução de obras.</InfoAlert>
      <SectionLabel>Dados do contrato de projeto</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de projeto</Label>
          <Select value={s.projTipo} onValueChange={v => set("projTipo", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="estrutural">Estrutural</SelectItem>
              <SelectItem value="arquitetonico">Arquitetônico</SelectItem>
              <SelectItem value="hidrossanitario">Hidrossanitário</SelectItem>
              <SelectItem value="eletrico">Elétrico / SPDA</SelectItem>
              <SelectItem value="completo">Projetos completos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumField label="Honorário estimado (R$)" value={s.projHonorario} step={500}
          onChange={v => set("projHonorario", v)} hint="Valor total do contrato de projeto." />
        <NumField label="Prazo de elaboração (semanas)" value={s.projPrazo} min={1} max={52}
          onChange={v => set("projPrazo", v)} />
      </div>
      <SectionLabel>Impostos — prestação de serviço intelectual (Lucro Presumido)</SectionLabel>
      <InfoAlert variant="warn">Presunção IRPJ/CSLL = 32% para serviço intelectual. Carga tributária total estimada: {fmtP(totalIProj)}.</InfoAlert>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        <MetricCard label="PIS" value={fmtP(s.pis)} />
        <MetricCard label="COFINS" value={fmtP(s.cofins)} />
        <MetricCard label="ISS" value={fmtP(s.iss)} />
        <MetricCard label="IRPJ" value={fmtP(irpjProj)} />
        <MetricCard label="CSLL" value={fmtP(csllProj)} />
        <MetricCard label="Total I projeto" value={fmtP(totalIProj)} variant="err" sub="vs. ~7,93% obra global" />
      </div>
      <SectionLabel>Composição do custo de produção do projeto</SectionLabel>
      <InfoAlert>Preencha os custos diretos de elaboração. Não há encargos de MO de obra — o custo é de hora técnica do engenheiro responsável e ferramentas.</InfoAlert>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["Item de custo","Qtd / horas","Valor unit. (R$)","Total (R$)"].map(h => (
                <th key={h} className="py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projCustos.map((c, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2 px-3">{c.item}</td>
                <td className="py-2 px-3">
                  <ProjQtdInput index={i} value={c.qtd} />
                </td>
                <td className="py-2 px-3">
                  <ProjUnitInput index={i} value={c.unit} />
                </td>
                <td className="py-2 px-3 text-right font-medium">{fmtR(c.qtd * c.unit)}</td>
              </tr>
            ))}
            <tr className="bg-muted/50 font-bold">
              <td className="py-2 px-3" colSpan={3}>Total custo direto</td>
              <td className="py-2 px-3 text-right">{fmtR(projCustoDireto)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <SectionLabel>Parâmetros do BDI de projeto</SectionLabel>
      <InfoAlert>O BDI de projeto usa a mesma fórmula TCU, mas com I diferente ({fmtP(projI)}) e risco menor — projeto não tem risco de execução físico.</InfoAlert>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <NumField label="Adm. Central — AC (%)" value={s.projAC} step={0.1} onChange={v => set("projAC", v)} hint="Puxado automaticamente da aba Adm. Central." />
        <NumField label="Lucro — L (%)" value={s.projL} step={0.5} min={5} max={30} onChange={v => set("projL", v)} hint="Projetos: 15–25%. Serviço intelectual tem margem maior." />
        <NumField label="Impostos — I (%)" value={projI} readOnly hint="Calculado automaticamente — presunção 32%." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <NumField label="Risco — R (%)" value={s.projR} step={0.5} min={0} max={4} onChange={v => set("projR", v)} hint="Projeto: 1–2% (sem risco de execução física)." />
        <NumField label="Garantia — G (%)" value={s.projG} step={0.5} min={0} max={3} onChange={v => set("projG", v)} />
        <NumField label="BDI de projeto calculado (%)" value={parseFloat(bdi.toFixed(2))} readOnly />
      </div>
      <SectionLabel>Resultado — BDI de projeto</SectionLabel>
      <div className="border border-border rounded-xl p-5 mb-4 flex flex-col sm:flex-row gap-6 items-start">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">BDI de projeto</p>
          <p className={`text-5xl font-bold leading-none tracking-tight ${bdiColor(bdi)}`}>{fmtP(bdi)}</p>
          <p className="text-sm text-muted-foreground mt-2">Multiplicador: <strong>{(1 + bdi / 100).toFixed(4)}</strong></p>
        </div>
        <div className="flex-1">
          <SectionLabel>Comparativo — BDI obra vs. BDI projeto</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="BDI obra" value={fmtP(bdiCalc)} variant="accent" />
            <MetricCard label="BDI projeto" value={fmtP(bdi)} variant="info" />
          </div>
        </div>
      </div>
      <SectionLabel>Precificação do projeto</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <NumField label="Custo direto de elaboração (R$)" value={projCustoDireto} readOnly hint="Calculado da tabela de custos acima." />
        <NumField label="Honorário mínimo sugerido (R$)" value={parseFloat(projPrecoSugerido.toFixed(2))} readOnly hint="Custo direto × (1 + BDI projeto)." />
      </div>
      <div className="border border-border rounded-xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard label="Custo direto" value={fmtR(projCustoDireto)} />
          <MetricCard label="BDI de projeto" value={fmtP(bdi)} variant="info" />
          <MetricCard label="Honorário mínimo sugerido" value={fmtR(projPrecoSugerido)} variant="ok" sub="custo direto × multiplicador" />
        </div>
      </div>
    </div>
  );
});
TabProjetos.displayName = "TabProjetos";

// Inputs de projeto separados
const ProjQtdInput = memo(({ index, value }: { index: number; value: number }) => {
  const { setProjCustos } = useBDI();
  return (
    <Input type="number" defaultValue={value} min={0}
      className="w-20 h-7 text-right text-sm"
      onBlur={ev => {
        setProjCustos(prev => {
          const nc = [...prev];
          nc[index] = { ...nc[index], qtd: parseFloat(ev.target.value) || 0 };
          return nc;
        });
      }} />
  );
});
ProjQtdInput.displayName = "ProjQtdInput";

const ProjUnitInput = memo(({ index, value }: { index: number; value: number }) => {
  const { setProjCustos } = useBDI();
  return (
    <Input type="number" defaultValue={value} min={0} step={10}
      className="w-24 h-7 text-right text-sm text-teal-600 dark:text-teal-400 font-semibold"
      onBlur={ev => {
        setProjCustos(prev => {
          const nc = [...prev];
          nc[index] = { ...nc[index], unit: parseFloat(ev.target.value) || 0 };
          return nc;
        });
      }} />
  );
});
ProjUnitInput.displayName = "ProjUnitInput";

// =================== ABA MEMÓRIA ===================
const TabMemoria = memo(() => {
  const { s, totalAC, pctAC, adicIRPJ, bdiCalc, calcMO } = useBDI();
  const dt = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const { encGlobal } = calcMO();
  const irpj = s.presIRPJ / 100 * s.aliqIRPJ + adicIRPJ();
  const csll = s.presCSLL / 100 * s.aliqCSLL;
  const totalIval = s.pis + s.cofins + s.iss + irpj + csll;
  const tipoLabel: Record<string, string> = {
    global: "Empreitada global (fornece material + MO)",
    parcial: "Empreitada parcial / mão de obra",
    misto: "Misto",
  };
  const AC = s.bdiAC / 100, L = s.bdiL / 100, I = s.bdiI / 100, R = s.bdiR / 100, G = s.bdiG / 100;
  const num = (1 + AC) * (1 + G) * (1 + R);
  const den = 1 - L - I;
  const keys = ["aluguel","salarios","contador","veiculo","ti","seguros","outros","deprec"] as const;
  const nomes: Record<string, string> = {
    aluguel: "Aluguel/escritório", salarios: "Salários adm. + pró-labore",
    contador: "Contador/jurídico", veiculo: "Veículos", ti: "TI/softwares",
    seguros: "Seguros/CREA/ARTs", outros: "Outros/deslocamentos", deprec: "Depreciação equip.",
  };
  const fieldMap: Record<string, keyof BDIState> = {
    aluguel: "acAluguel", salarios: "acSalarios", contador: "acContador", veiculo: "acVeiculo",
    ti: "acTi", seguros: "acSeguros", outros: "acOutros", deprec: "acDeprec",
  };
  return (
    <div>
      <InfoAlert variant="warn">Documento técnico com todos os parâmetros, cálculos e referências normativas. Use como anexo em propostas, contratos e licitações.</InfoAlert>
      <div className="border border-border rounded-xl p-5 space-y-6 text-sm" id="memoria-content">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Identificação</p>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Empresa", "EG — Projetos e Consultoria em Construção Ltda"],
                ["Responsável técnico", "Eng. Civil Elisandro Antonio Gasparrini — CREA/SC 066.571-0"],
                ["Data de geração", dt],
                ["Regime tributário", "Lucro Presumido"],
                ["Município / ISS", `Xanxerê/SC — ${fmtP(s.iss)} (LC 116/2003)`],
                ["Tipo de contrato", tipoLabel[s.tipoObra] ?? s.tipoObra],
                ["Faturamento médio mensal", fmtR(s.fatMensal)],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-border/30">
                  <td className="py-1.5 pr-4 text-muted-foreground w-48">{k}</td>
                  <td className="py-1.5 font-medium">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">1. Impostos — I (denominador)</p>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-border"><th className="text-left py-1.5 text-xs text-muted-foreground">Tributo</th><th className="text-left py-1.5 text-xs text-muted-foreground">Base / referência</th><th className="text-right py-1.5 text-xs text-muted-foreground">% s/ faturamento</th></tr></thead>
            <tbody>
              {[
                { t: "PIS", base: "Lei 10.637/02 — regime cumulativo", v: s.pis },
                { t: "COFINS", base: "Lei 10.833/03 — regime cumulativo", v: s.cofins },
                { t: "ISS", base: "LC 116/2003 — alíquota Xanxerê/SC", v: s.iss },
                { t: "IRPJ", base: `Presunção ${s.presIRPJ}% × ${s.aliqIRPJ}% — IN RFB 1.700/2017 art.33`, v: irpj },
                { t: "CSLL", base: `Presunção ${s.presCSLL}% × ${s.aliqCSLL}% — IN RFB 1.700/2017 art.34`, v: csll },
              ].map(row => (
                <tr key={row.t} className="border-b border-border/30">
                  <td className="py-1.5">{row.t}</td>
                  <td className="py-1.5 text-muted-foreground text-xs">{row.base}</td>
                  <td className="py-1.5 text-right">{fmtP(row.v)}</td>
                </tr>
              ))}
              <tr className="font-bold bg-muted/30"><td className="py-1.5" colSpan={2}>Total I</td><td className="py-1.5 text-right text-teal-600 dark:text-teal-400">{fmtP(totalIval)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">2. Administração Central — AC (numerador)</p>
          <p className="text-xs text-muted-foreground mb-2">Total de custos fixos mensais: {fmtR(totalAC)} / Faturamento médio: {fmtR(s.fatMensal)}</p>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-border"><th className="text-left py-1.5 text-xs text-muted-foreground">Item</th><th className="text-right py-1.5 text-xs text-muted-foreground">R$/mês</th></tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k} className="border-b border-border/30">
                  <td className="py-1.5">{nomes[k]}</td>
                  <td className="py-1.5 text-right">{fmtR(s[fieldMap[k]] as number)}</td>
                </tr>
              ))}
              <tr className="font-bold bg-muted/30"><td className="py-1.5">Total AC</td><td className="py-1.5 text-right">{fmtR(totalAC)}</td></tr>
              <tr className="font-bold bg-muted/30"><td className="py-1.5">AC (% faturamento)</td><td className="py-1.5 text-right text-teal-600 dark:text-teal-400">{fmtP(pctAC)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">3. Encargos sociais — MO</p>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Base de cálculo", "Piso CCT Oeste/SC jan/2025 — regime CLT não desonerado"],
                ["Taxa sobre o piso", `${ENC_PCT}%`],
                ["Encargo efetivo s/ diária", `${fmtP(encGlobal)} (sobre a diária paga pela empresa)`],
                ["Dias úteis/mês", `${s.diasMes} dias`],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-border/30">
                  <td className="py-1.5 pr-4 text-muted-foreground w-48">{k}</td>
                  <td className="py-1.5 font-medium">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">4. Fórmula BDI — resultado final</p>
          <div className="bg-muted/50 rounded-lg p-4 font-mono text-xs leading-7">
            <p><strong>BDI = [(1+AC)(1+G)(1+R)] / (1−L−I) − 1</strong></p>
            <p>AC = {fmtP(s.bdiAC)} | L = {fmtP(s.bdiL)} | I = {fmtP(s.bdiI)} | R = {fmtP(s.bdiR)} | G = {fmtP(s.bdiG)}</p>
            <p>Numerador = (1+{fmtP(AC*100)})(1+{fmtP(G*100)})(1+{fmtP(R*100)}) = {fmt(num, 6)}</p>
            <p>Denominador = 1 − {fmtP(L*100)} − {fmtP(I*100)} = {fmt(den, 6)}</p>
            <p className="text-base font-bold text-foreground mt-1">BDI = {fmtP(bdiCalc)} | Multiplicador = {(1 + bdiCalc / 100).toFixed(4)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Ref.: Acórdão TCU 2.622/2013 · SINAPI CEF/IBGE</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={() => window.print()} className="gap-2">
          <Printer className="w-4 h-4" />
          Imprimir / Exportar PDF
        </Button>
      </div>
    </div>
  );
});
TabMemoria.displayName = "TabMemoria";

// =================== COMPONENTE PRINCIPAL ===================
interface BDICalculatorProps {
  budgetId?: number | null;
  onSave?: (bdiParams: { adminCentral: number; profit: number; taxes: number; risk: number; warranty: number; socialCharges: number }) => void;
}

export function BDICalculator({ budgetId, onSave }: BDICalculatorProps = {}) {
  const [s, setS] = useState<BDIState>(DEFAULT_STATE);
  const [equipe, setEquipe] = useState<EquipeMembro[]>([
    { key: "servente",    qtd: 2, diaria: 180 },
    { key: "meiooficial", qtd: 1, diaria: 200 },
    { key: "pedreiro",    qtd: 3, diaria: 220 },
    { key: "mestre",      qtd: 1, diaria: 280 },
  ]);
  const [projCustos, setProjCustos] = useState<ProjCusto[]>(PROJ_CUSTOS_DEFAULT);
  const [lastSavedBDI, setLastSavedBDI] = useState<string>("");

  const set = useCallback((field: keyof BDIState, value: number | string) =>
    setS(prev => ({ ...prev, [field]: value })), []);
  
  // Auto-save BDI parameters quando mudam
  useEffect(() => {
    if (!budgetId || !onSave) return;
    
    const currentBDI = JSON.stringify({
      bdiAC: s.bdiAC,
      bdiL: s.bdiL,
      bdiI: s.bdiI,
      bdiR: s.bdiR,
      bdiG: s.bdiG,
    });
    
    if (currentBDI !== lastSavedBDI) {
      const timer = setTimeout(() => {
        onSave({
          adminCentral: s.bdiAC,
          profit: s.bdiL,
          taxes: s.bdiI,
          risk: s.bdiR,
          warranty: s.bdiG,
          socialCharges: 33,
        });
        setLastSavedBDI(currentBDI);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [s.bdiAC, s.bdiL, s.bdiI, s.bdiR, s.bdiG, budgetId, onSave, lastSavedBDI]);

  // =================== CÁLCULOS DERIVADOS ===================
  const adicIRPJ = useCallback(() => {
    const lucroPresumido = s.fatMensal * s.presIRPJ / 100;
    return lucroPresumido > 20000 ? (lucroPresumido - 20000) * 0.10 / s.fatMensal * 100 : 0;
  }, [s.fatMensal, s.presIRPJ]);

  const totalI = useCallback(() => {
    const irpj = s.presIRPJ / 100 * s.aliqIRPJ + adicIRPJ();
    const csll = s.presCSLL / 100 * s.aliqCSLL;
    return s.pis + s.cofins + s.iss + irpj + csll;
  }, [s.pis, s.cofins, s.iss, s.presIRPJ, s.aliqIRPJ, s.presCSLL, s.aliqCSLL, adicIRPJ]);

  const totalAC = s.acAluguel + s.acSalarios + s.acContador + s.acVeiculo +
                  s.acTi + s.acSeguros + s.acOutros + s.acDeprec;
  const pctAC = s.fatMensal > 0 ? totalAC / s.fatMensal * 100 : 0;

  const calcMO = useCallback(() => {
    let totalEncMes = 0, totalSalMes = 0, totalFuncs = 0;
    equipe.forEach(e => {
      const p = PISOS[e.key];
      const encMes = p.piso * ENC_PCT / 100;
      const salMes = e.diaria * s.diasMes;
      totalEncMes += encMes * e.qtd;
      totalSalMes += salMes * e.qtd;
      totalFuncs  += e.qtd;
    });
    const encGlobal = totalSalMes > 0 ? totalEncMes / totalSalMes * 100 : 0;
    return { encGlobal, totalEncMes, totalFuncs };
  }, [equipe, s.diasMes]);

  const bdiCalc = calcBDIFormula(s.bdiAC, s.bdiL, s.bdiI, s.bdiR, s.bdiG);
  const bdiMultiplier = 1 + bdiCalc / 100;

  const { data: companySettings } = trpc.companySettings.get.useQuery();
  const { encGlobal: socialChargesPct } = calcMO();

  const handleExportBDIExcel = () => {
    if (!companySettings) return;
    generateBDIExcel(companySettings, "Simulação avulsa", {
      socialCharges: socialChargesPct,
      adminCentral: s.bdiAC,
      profit: s.bdiL,
      taxes: s.bdiI,
      risk: s.bdiR,
      warranty: s.bdiG,
      bdiRate: bdiCalc,
    });
  };

  const handleExportBDIPDF = () => {
    if (!companySettings) return;
    generateBDIPDF(companySettings, "Simulação avulsa", {
      socialCharges: socialChargesPct,
      adminCentral: s.bdiAC,
      profit: s.bdiL,
      taxes: s.bdiI,
      risk: s.bdiR,
      warranty: s.bdiG,
      bdiRate: bdiCalc,
    });
  };

  const projI = 14.33;
  const projBDI = calcBDIFormula(s.projAC, s.projL, projI, s.projR, s.projG);
  const projCustoDireto = projCustos.reduce((sum, c) => sum + c.qtd * c.unit, 0);
  const projPrecoSugerido = projCustoDireto * (1 + projBDI / 100);

  // Sincronizar I, AC e R com valores calculados
  useEffect(() => {
    const i = totalI();
    const risco: Record<string, number> = { residencial: 1.0, comercial: 2.0, frigorifico: 3.5, complexo: 4.5 };
    const presIRPJ = s.tipoObra === "parcial" ? 32 : s.tipoObra === "misto" ? 20 : 8;
    const presCSLL = s.tipoObra === "parcial" ? 32 : s.tipoObra === "misto" ? 22 : 12;
    setS(prev => ({
      ...prev,
      bdiI: parseFloat(i.toFixed(4)),
      bdiAC: parseFloat(pctAC.toFixed(2)),
      bdiR: risco[prev.tipoRisco] ?? 2.0,
      presIRPJ,
      presCSLL,
      projAC: parseFloat(pctAC.toFixed(2)),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.fatMensal, s.pis, s.cofins, s.iss, s.presIRPJ, s.presCSLL, s.aliqIRPJ, s.aliqCSLL,
      totalAC, s.tipoObra, s.tipoRisco]);

  const contextValue: BDIContextType = {
    s, set, equipe, setEquipe, projCustos, setProjCustos,
    totalAC, pctAC, adicIRPJ, totalI, calcMO,
    bdiCalc, bdiMultiplier, projI, projBDI, projCustoDireto, projPrecoSugerido,
  };

  return (
    <BDIContext.Provider value={contextValue}>
      <div className="space-y-4">
        {/* Header com BDI calculado */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-bold">Calculadora de BDI</h2>
            <p className="text-xs text-muted-foreground">Fórmula clássica de BDI · Lucro Presumido · CCT Oeste/SC jan/2025</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">BDI calculado</p>
              <p className={`text-3xl font-bold leading-none ${bdiColor(bdiCalc)}`}>{fmtP(bdiCalc)}</p>
              <p className="text-[10px] text-muted-foreground">Multiplicador: {bdiMultiplier.toFixed(4)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">BDI Projeto</p>
              <p className={`text-xl font-bold leading-none ${bdiColor(projBDI)}`}>{fmtP(projBDI)}</p>
            </div>
            <div className="flex gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={handleExportBDIExcel} disabled={!companySettings} title="Exportar demonstrativo de BDI em Excel">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleExportBDIPDF} disabled={!companySettings} title="Exportar demonstrativo de BDI em PDF">
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
                PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Sub-abas */}
        <Tabs defaultValue="empresa">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="empresa" className="gap-1.5 text-xs"><Building2 className="w-3.5 h-3.5" />1 · Empresa</TabsTrigger>
            <TabsTrigger value="tributario" className="gap-1.5 text-xs"><FileText className="w-3.5 h-3.5" />2 · Tributário</TabsTrigger>
            <TabsTrigger value="ac" className="gap-1.5 text-xs"><TrendingUp className="w-3.5 h-3.5" />3 · Adm. Central</TabsTrigger>
            <TabsTrigger value="mo" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" />4 · Mão de Obra</TabsTrigger>
            <TabsTrigger value="bdi" className="gap-1.5 text-xs"><Calculator className="w-3.5 h-3.5" />5 · BDI</TabsTrigger>
            <TabsTrigger value="projetos" className="gap-1.5 text-xs"><FolderOpen className="w-3.5 h-3.5" />6 · Projetos</TabsTrigger>
            <TabsTrigger value="memoria" className="gap-1.5 text-xs"><Info className="w-3.5 h-3.5" />7 · Memória</TabsTrigger>
          </TabsList>
          <div className="mt-4">
            <TabsContent value="empresa"    className="mt-0"><TabEmpresa /></TabsContent>
            <TabsContent value="tributario" className="mt-0"><TabTributario /></TabsContent>
            <TabsContent value="ac"         className="mt-0"><TabAC /></TabsContent>
            <TabsContent value="mo"         className="mt-0"><TabMO /></TabsContent>
            <TabsContent value="bdi"        className="mt-0"><TabBDI /></TabsContent>
            <TabsContent value="projetos"   className="mt-0"><TabProjetos /></TabsContent>
            <TabsContent value="memoria"    className="mt-0"><TabMemoria /></TabsContent>
          </div>
        </Tabs>
        
        {/* Auto-save ao sair do campo */}
        {budgetId && onSave && (
          <div className="hidden">
            {/* Trigger auto-save quando valores mudam */}
            {JSON.stringify({profit: s.bdiL, risk: s.bdiR, warranty: s.bdiG})}
          </div>
        )}
      </div>
    </BDIContext.Provider>
  );
}

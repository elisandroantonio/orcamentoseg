/**
 * BASE DE CONHECIMENTO TÉCNICO - CONSTRUÇÃO CIVIL
 * 
 * Dados baseados em fontes técnicas confiáveis:
 * - Sienge (plataforma líder em gestão de construção civil no Brasil)
 * - Normas técnicas e práticas consolidadas do setor
 * 
 * Este arquivo contém:
 * - Classificação de serviços por categoria
 * - Dependências técnicas entre etapas
 * - Durações típicas e curvas de produtividade
 * - Regras de sequenciamento lógico
 */

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ConstructionPhase {
  keywords: string[]; // Palavras-chave para identificação automática
  category: ConstructionCategory;
  typicalDurationMonths: number; // Duração típica em meses
  percentageOfTotal: number; // Porcentagem típica do projeto total
  dependencies: string[]; // Categorias que devem ser concluídas antes
  canOverlap: string[]; // Categorias que podem executar em paralelo
  productivityCurve: 'slow-peak-slow' | 'linear' | 'fast-start' | 'slow-start';
  description: string;
}

export type ConstructionCategory =
  | 'terreno_topografia'
  | 'projeto'
  | 'planejamento_orcamento'
  | 'servicos_preliminares'
  | 'fundacao'
  | 'estrutura'
  | 'vedacao_alvenaria'
  | 'impermeabilizacao'
  | 'cobertura_telhado'
  | 'instalacoes_hidraulicas'
  | 'instalacoes_eletricas'
  | 'instalacoes_complementares'
  | 'esquadrias'
  | 'revestimento_interno'
  | 'revestimento_externo'
  | 'pintura'
  | 'pisos_acabamento'
  | 'loucas_metais'
  | 'limpeza_entrega'
  | 'paisagismo'
  | 'outros';

// ============================================================================
// BASE DE CONHECIMENTO - ETAPAS DE CONSTRUÇÃO
// ============================================================================

export const CONSTRUCTION_PHASES: Record<ConstructionCategory, ConstructionPhase> = {
  terreno_topografia: {
    keywords: ['terreno', 'topografia', 'levantamento', 'sondagem', 'solo'],
    category: 'terreno_topografia',
    typicalDurationMonths: 4,
    percentageOfTotal: 9.04,
    dependencies: [],
    canOverlap: ['projeto'],
    productivityCurve: 'linear',
    description: 'Escolha do terreno e levantamento topográfico'
  },

  projeto: {
    keywords: ['projeto', 'arquitetônico', 'arquitetura', 'design', 'plantas'],
    category: 'projeto',
    typicalDurationMonths: 5,
    percentageOfTotal: 11.28,
    dependencies: ['terreno_topografia'],
    canOverlap: ['planejamento_orcamento'],
    productivityCurve: 'slow-peak-slow',
    description: 'Elaboração do projeto arquitetônico'
  },

  planejamento_orcamento: {
    keywords: ['planejamento', 'orçamento', 'cronograma', 'custos', 'viabilidade'],
    category: 'planejamento_orcamento',
    typicalDurationMonths: 2,
    percentageOfTotal: 4.51,
    dependencies: ['projeto'],
    canOverlap: ['servicos_preliminares'],
    productivityCurve: 'linear',
    description: 'Planejamento e definição de orçamento'
  },

  servicos_preliminares: {
    keywords: ['preliminar', 'limpeza', 'terraplanagem', 'demolição', 'locação', 'canteiro'],
    category: 'servicos_preliminares',
    typicalDurationMonths: 1,
    percentageOfTotal: 2.26,
    dependencies: ['planejamento_orcamento'],
    canOverlap: [],
    productivityCurve: 'fast-start',
    description: 'Serviços preliminares e preparação do terreno'
  },

  fundacao: {
    keywords: ['fundação', 'sapata', 'estaca', 'tubulão', 'radier', 'blocos de fundação'],
    category: 'fundacao',
    typicalDurationMonths: 3,
    percentageOfTotal: 13.52,
    dependencies: ['servicos_preliminares'],
    canOverlap: [],
    productivityCurve: 'slow-start',
    description: 'Execução de fundações'
  },

  estrutura: {
    keywords: ['estrutura', 'concreto', 'pilares', 'vigas', 'lajes', 'armação', 'concretagem', 'forma'],
    category: 'estrutura',
    typicalDurationMonths: 3,
    percentageOfTotal: 13.52,
    dependencies: ['fundacao'],
    canOverlap: [],
    productivityCurve: 'slow-peak-slow',
    description: 'Execução da estrutura (pilares, vigas, lajes)'
  },

  vedacao_alvenaria: {
    keywords: ['alvenaria', 'vedação', 'parede', 'bloco', 'tijolo', 'divisória'],
    category: 'vedacao_alvenaria',
    typicalDurationMonths: 4,
    percentageOfTotal: 9.04,
    dependencies: ['estrutura'],
    canOverlap: ['impermeabilizacao'],
    productivityCurve: 'slow-peak-slow',
    description: 'Vedações verticais internas e externas (alvenaria)'
  },

  impermeabilizacao: {
    keywords: ['impermeabilização', 'impermeabilizante', 'manta', 'umidade'],
    category: 'impermeabilizacao',
    typicalDurationMonths: 1.5,
    percentageOfTotal: 3.38,
    dependencies: ['estrutura'],
    canOverlap: ['vedacao_alvenaria'],
    productivityCurve: 'linear',
    description: 'Impermeabilização de pisos e paredes'
  },

  cobertura_telhado: {
    keywords: ['cobertura', 'telhado', 'telha', 'madeiramento', 'calha', 'rufo'],
    category: 'cobertura_telhado',
    typicalDurationMonths: 5,
    percentageOfTotal: 11.28,
    dependencies: ['estrutura', 'vedacao_alvenaria'],
    canOverlap: ['instalacoes_hidraulicas', 'instalacoes_eletricas'],
    productivityCurve: 'slow-peak-slow',
    description: 'Construção de paredes e telhados'
  },

  instalacoes_hidraulicas: {
    keywords: ['hidráulica', 'água', 'esgoto', 'tubulação', 'encanamento', 'caixa d\'água'],
    category: 'instalacoes_hidraulicas',
    typicalDurationMonths: 2,
    percentageOfTotal: 4.51,
    dependencies: ['vedacao_alvenaria'],
    canOverlap: ['instalacoes_eletricas', 'instalacoes_complementares'],
    productivityCurve: 'linear',
    description: 'Instalações hidráulicas (água e esgoto)'
  },

  instalacoes_eletricas: {
    keywords: ['elétrica', 'fiação', 'eletroduto', 'tomada', 'interruptor', 'disjuntor', 'quadro'],
    category: 'instalacoes_eletricas',
    typicalDurationMonths: 2,
    percentageOfTotal: 4.51,
    dependencies: ['vedacao_alvenaria'],
    canOverlap: ['instalacoes_hidraulicas', 'instalacoes_complementares'],
    productivityCurve: 'linear',
    description: 'Instalações elétricas'
  },

  instalacoes_complementares: {
    keywords: ['gás', 'ar condicionado', 'telefone', 'internet', 'automação', 'alarme', 'cftv'],
    category: 'instalacoes_complementares',
    typicalDurationMonths: 3,
    percentageOfTotal: 6.76,
    dependencies: ['vedacao_alvenaria'],
    canOverlap: ['instalacoes_hidraulicas', 'instalacoes_eletricas'],
    productivityCurve: 'linear',
    description: 'Instalações complementares (gás, ar condicionado, etc.)'
  },

  esquadrias: {
    keywords: ['esquadria', 'porta', 'janela', 'vidro', 'alumínio', 'marco'],
    category: 'esquadrias',
    typicalDurationMonths: 2,
    percentageOfTotal: 4.51,
    dependencies: ['vedacao_alvenaria', 'instalacoes_hidraulicas', 'instalacoes_eletricas'],
    canOverlap: ['revestimento_interno'],
    productivityCurve: 'linear',
    description: 'Instalação de esquadrias (portas e janelas)'
  },

  revestimento_interno: {
    keywords: ['revestimento interno', 'chapisco', 'reboco', 'emboço', 'massa corrida', 'gesso'],
    category: 'revestimento_interno',
    typicalDurationMonths: 4,
    percentageOfTotal: 9.04,
    dependencies: ['vedacao_alvenaria', 'instalacoes_hidraulicas', 'instalacoes_eletricas'],
    canOverlap: ['revestimento_externo'],
    productivityCurve: 'slow-peak-slow',
    description: 'Revestimentos internos (chapisco, reboco, gesso)'
  },

  revestimento_externo: {
    keywords: ['revestimento externo', 'fachada', 'textura', 'grafiato'],
    category: 'revestimento_externo',
    typicalDurationMonths: 2,
    percentageOfTotal: 4.51,
    dependencies: ['vedacao_alvenaria', 'cobertura_telhado'],
    canOverlap: ['revestimento_interno'],
    productivityCurve: 'linear',
    description: 'Revestimentos externos (fachada)'
  },

  pintura: {
    keywords: ['pintura', 'tinta', 'massa corrida', 'selador'],
    category: 'pintura',
    typicalDurationMonths: 2,
    percentageOfTotal: 4.51,
    dependencies: ['revestimento_interno', 'revestimento_externo'],
    canOverlap: ['pisos_acabamento'],
    productivityCurve: 'linear',
    description: 'Pintura interna e externa'
  },

  pisos_acabamento: {
    keywords: ['piso', 'cerâmica', 'porcelanato', 'azulejo', 'contrapiso', 'rodapé', 'acabamento'],
    category: 'pisos_acabamento',
    typicalDurationMonths: 3,
    percentageOfTotal: 6.76,
    dependencies: ['revestimento_interno', 'instalacoes_hidraulicas', 'instalacoes_eletricas'],
    canOverlap: ['pintura', 'loucas_metais'],
    productivityCurve: 'slow-peak-slow',
    description: 'Pisos e acabamentos'
  },

  loucas_metais: {
    keywords: ['louça', 'metal', 'sanitário', 'vaso', 'pia', 'torneira', 'chuveiro', 'bancada'],
    category: 'loucas_metais',
    typicalDurationMonths: 1,
    percentageOfTotal: 2.26,
    dependencies: ['pisos_acabamento', 'pintura'],
    canOverlap: [],
    productivityCurve: 'linear',
    description: 'Instalação de louças e metais'
  },

  limpeza_entrega: {
    keywords: ['limpeza', 'entrega', 'final', 'vistoria', 'habite-se'],
    category: 'limpeza_entrega',
    typicalDurationMonths: 2,
    percentageOfTotal: 4.51,
    dependencies: ['loucas_metais'],
    canOverlap: ['paisagismo'],
    productivityCurve: 'linear',
    description: 'Limpeza e entrega da obra'
  },

  paisagismo: {
    keywords: ['paisagismo', 'jardim', 'gramado', 'plantas', 'área verde'],
    category: 'paisagismo',
    typicalDurationMonths: 1,
    percentageOfTotal: 2.26,
    dependencies: ['limpeza_entrega'],
    canOverlap: [],
    productivityCurve: 'linear',
    description: 'Paisagismo e áreas verdes'
  },

  outros: {
    keywords: [],
    category: 'outros',
    typicalDurationMonths: 1,
    percentageOfTotal: 2.0,
    dependencies: [],
    canOverlap: [],
    productivityCurve: 'linear',
    description: 'Outros serviços'
  }
};

// ============================================================================
// FUNÇÕES DE CLASSIFICAÇÃO E ANÁLISE
// ============================================================================

/**
 * Classifica uma etapa/composição baseado em palavras-chave
 */
export function classifyStage(description: string): ConstructionCategory {
  const lowerDesc = description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  for (const [category, phase] of Object.entries(CONSTRUCTION_PHASES)) {
    for (const keyword of phase.keywords) {
      const normalizedKeyword = keyword.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lowerDesc.includes(normalizedKeyword)) {
        return category as ConstructionCategory;
      }
    }
  }
  
  return 'outros';
}

/**
 * Retorna as dependências de uma categoria
 */
export function getDependencies(category: ConstructionCategory): ConstructionCategory[] {
  return CONSTRUCTION_PHASES[category].dependencies as ConstructionCategory[];
}

/**
 * Verifica se duas categorias podem executar em paralelo
 */
export function canExecuteInParallel(cat1: ConstructionCategory, cat2: ConstructionCategory): boolean {
  const phase1 = CONSTRUCTION_PHASES[cat1];
  const phase2 = CONSTRUCTION_PHASES[cat2];
  
  return phase1.canOverlap.includes(cat2) || phase2.canOverlap.includes(cat1);
}

/**
 * Calcula duração estimada baseada no valor da composição
 * Fórmula: duração base ajustada pelo valor relativo ao total
 */
export function estimateDuration(
  category: ConstructionCategory,
  valueWithBDI: number,
  totalBudget: number
): number {
  const phase = CONSTRUCTION_PHASES[category];
  const valuePercentage = (valueWithBDI / totalBudget) * 100;
  
  // Ajusta duração baseado no valor relativo
  // Se o valor é maior que a porcentagem típica, aumenta a duração
  const adjustmentFactor = valuePercentage / phase.percentageOfTotal;
  const estimatedMonths = phase.typicalDurationMonths * adjustmentFactor;
  
  // Limita entre 0.5 e 12 meses
  return Math.max(0.5, Math.min(12, estimatedMonths));
}

/**
 * Gera curva de distribuição temporal baseada no tipo de produtividade
 */
export function generateDistributionCurve(
  curve: ConstructionPhase['productivityCurve'],
  numPeriods: number
): number[] {
  const distribution: number[] = [];
  
  switch (curve) {
    case 'slow-peak-slow':
      // Curva em sino: início lento (20%), pico no meio (60%), finalização lenta (20%)
      for (let i = 0; i < numPeriods; i++) {
        const x = i / (numPeriods - 1); // 0 a 1
        // Função gaussiana simplificada
        const value = Math.exp(-Math.pow((x - 0.5) * 3, 2));
        distribution.push(value);
      }
      break;
      
    case 'fast-start':
      // Início rápido, depois desacelera
      for (let i = 0; i < numPeriods; i++) {
        const x = i / (numPeriods - 1);
        distribution.push(Math.exp(-x * 2));
      }
      break;
      
    case 'slow-start':
      // Início lento, acelera depois
      for (let i = 0; i < numPeriods; i++) {
        const x = i / (numPeriods - 1);
        distribution.push(1 - Math.exp(-x * 2));
      }
      break;
      
    case 'linear':
    default:
      // Distribuição uniforme
      for (let i = 0; i < numPeriods; i++) {
        distribution.push(1);
      }
      break;
  }
  
  // Normaliza para somar 100%
  const sum = distribution.reduce((a, b) => a + b, 0);
  return distribution.map(v => (v / sum) * 100);
}

/**
 * Ordena etapas respeitando dependências técnicas
 */
export function sortStagesByDependencies(
  stages: Array<{ id: number; category: ConstructionCategory }>
): Array<{ id: number; category: ConstructionCategory; order: number }> {
  const sorted: Array<{ id: number; category: ConstructionCategory; order: number }> = [];
  const processed = new Set<number>();
  
  let order = 0;
  
  // Função recursiva para processar dependências
  function processDependencies(stageId: number, category: ConstructionCategory) {
    if (processed.has(stageId)) return;
    
    const deps = getDependencies(category);
    
    // Processa dependências primeiro
    for (const dep of deps) {
      const depStage = stages.find(s => s.category === dep && !processed.has(s.id));
      if (depStage) {
        processDependencies(depStage.id, depStage.category);
      }
    }
    
    // Adiciona etapa atual
    sorted.push({ id: stageId, category, order: order++ });
    processed.add(stageId);
  }
  
  // Processa todas as etapas
  for (const stage of stages) {
    processDependencies(stage.id, stage.category);
  }
  
  return sorted;
}

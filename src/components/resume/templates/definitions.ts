import type { TemplateId } from '@/types/resume';

/**
 * Os cinco modelos.
 *
 * TODOS SÃO DE COLUNA ÚNICA, e isso não é falta de ambição visual. Currículo
 * em duas colunas é lido pelo parser na ordem errada com frequência: a coluna
 * lateral entra no meio da experiência e o texto sai embaralhado. Pelo mesmo
 * motivo, nenhum modelo tem barra de habilidade, gráfico, ícone dentro do
 * conteúdo, tabela ou caixa de texto — todos são elementos que o extrator ou
 * ignora ou lê torto.
 *
 * O que varia entre eles é tipografia, peso do cabeçalho, cor de destaque e
 * densidade. É o que dá para variar sem prejudicar a leitura automática.
 */
export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
  /** Quem ganha mais com este modelo. */
  bestFor: string;
  /** Cor de destaque, em hex — usada em título de seção e no filete. */
  accent: string;
  /** Cabeçalho centralizado ou alinhado à esquerda. */
  headerAlign: 'left' | 'center';
  /** Título de seção em caixa alta. */
  uppercaseHeadings: boolean;
  /** Filete abaixo do título de seção. */
  sectionRule: 'full' | 'short' | 'none';
  /** Escala geral do texto. Compacto cabe mais conteúdo na mesma página. */
  density: 'confortavel' | 'compacto';
  /** Serifa transmite formalidade; sem serifa, modernidade. */
  family: 'sans' | 'serif';
  /** Tamanho do nome no topo, em pontos. */
  nameSize: number;
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'executivo',
    name: 'Executivo',
    description: 'Serifa, cabeçalho centralizado e seções bem separadas. Transmite formalidade.',
    bestFor: 'Cargos de gestão, áreas jurídica e financeira',
    accent: '#1e358a',
    headerAlign: 'center',
    uppercaseHeadings: true,
    sectionRule: 'full',
    density: 'confortavel',
    family: 'serif',
    nameSize: 22,
  },
  {
    id: 'moderno',
    name: 'Moderno',
    description: 'Sem serifa, cabeçalho à esquerda e destaque azul discreto nos títulos.',
    bestFor: 'A maioria das candidaturas',
    accent: '#2559eb',
    headerAlign: 'left',
    uppercaseHeadings: true,
    sectionRule: 'short',
    density: 'confortavel',
    family: 'sans',
    nameSize: 21,
  },
  {
    id: 'minimalista',
    name: 'Minimalista',
    description: 'Preto e branco, sem filete, com espaço em branco fazendo a separação.',
    bestFor: 'Áreas criativas e de tecnologia',
    accent: '#111827',
    headerAlign: 'left',
    uppercaseHeadings: false,
    sectionRule: 'none',
    density: 'confortavel',
    family: 'sans',
    nameSize: 20,
  },
  {
    id: 'corporativo',
    name: 'Corporativo',
    description: 'Denso e direto, com títulos em caixa alta e filete cheio. Cabe mais conteúdo.',
    bestFor: 'Quem tem histórico longo e precisa caber em uma página',
    accent: '#374151',
    headerAlign: 'left',
    uppercaseHeadings: true,
    sectionRule: 'full',
    density: 'compacto',
    family: 'sans',
    nameSize: 19,
  },
  {
    id: 'primeiro-emprego',
    name: 'Primeiro emprego',
    description: 'Cabeçalho generoso e seções espaçadas, para um currículo com menos conteúdo não parecer vazio.',
    bestFor: 'Primeiro emprego e estágio',
    accent: '#2559eb',
    headerAlign: 'center',
    uppercaseHeadings: false,
    sectionRule: 'short',
    density: 'confortavel',
    family: 'sans',
    nameSize: 23,
  },
];

export function templateById(id: TemplateId): TemplateDefinition {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[1];
}

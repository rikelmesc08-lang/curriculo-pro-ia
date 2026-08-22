import { normalizeForCompare } from '@/lib/utils';

/**
 * Extração de palavras-chave sem modelo de linguagem.
 *
 * Serve a dois donos:
 *   1. o modo demonstração, que precisa produzir algo verdadeiro sem chamar IA;
 *   2. a análise ATS, cuja parte de cobertura de palavra-chave é medição, não
 *      opinião — e medição não deveria custar uma chamada de API nem variar
 *      entre execuções.
 *
 * Isto NÃO é análise semântica. É contagem de termo relevante com lista de
 * parada em português. A UI nunca apresenta a saída daqui como se fosse
 * interpretação de IA.
 */

/**
 * Palavras que aparecem em qualquer vaga e não distinguem nada.
 *
 * A lista cresce por observação, não por adivinhação. O último bloco entrou
 * depois de uma análise real devolver "afins, boa, cursando, elaboracao" como
 * palavras-chave ausentes do currículo — termos que não dizem nada sobre a vaga
 * e que faziam a tela parecer desleixada.
 *
 * O que NÃO entra aqui é termo que distingue de verdade. "contabeis" apareceu
 * no mesmo ruído e ficou de fora de propósito: "Ciências Contábeis" é uma
 * qualificação real, e silenciá-la esconderia uma lacuna verdadeira do
 * currículo.
 */
const STOPWORDS = new Set(
  `a o os as um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre ate ate
   e ou mas que se ao aos à às pelo pela pelos pelas este esta estes estas esse essa esses essas
   isso aquilo seu sua seus suas nosso nossa meu minha ser estar ter haver fazer sera serao
   voce voces nos eles elas ele ela lhe como quando onde qual quais quanto mais menos muito pouco
   todo toda todos todas outro outra outros outras mesmo mesma ja nao sim tambem entre apos antes
   durante cada qualquer algum alguma nenhum nenhuma vaga vagas empresa empresas candidato
   candidatos candidata profissional profissionais area areas trabalho trabalhos atividade
   atividades funcao funcoes cargo cargos requisito requisitos desejavel desejaveis diferencial
   diferenciais beneficio beneficios salario horario contrato regime nivel niveis experiencia
   experiencias conhecimento conhecimentos habilidade habilidades competencia competencias
   responsabilidade responsabilidades atribuicao atribuicoes descricao sobre nossa nosso equipe
   time buscamos procuramos oferecemos oferecer atuar atuara realizar realizara apoiar auxiliar
   garantir manter participar acompanhar ainda bem melhor maior menor novo nova ano anos mes meses
   dia dias hora horas r$ clt pj home office presencial hibrido remoto
   afim afins boa boas bom bons solida solido solidas solidos forte fortes
   cursando cursado cursada completo completa completos completas incompleto
   incompleta elaboracao elaborar elaborando vivencia vivencias dominio dominar
   necessario necessaria necessarios necessarias imprescindivel imprescindiveis
   obrigatorio obrigatoria possuir possua capacidade facilidade disponibilidade
   preferencia preferencialmente minimo minima principal principais`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Termos compostos que perdem o sentido quebrados em palavras soltas.
 * A lista é curta de propósito: cobre o que aparece de fato em vaga
 * brasileira, sem virar um dicionário que ninguém mantém.
 */
const MULTIWORD_TERMS = [
  'excel avancado', 'pacote office', 'power bi', 'sql server', 'google analytics',
  'atendimento ao cliente', 'gestao de pessoas', 'gestao de projetos', 'trabalho em equipe',
  'comunicacao assertiva', 'resolucao de problemas', 'ensino medio', 'ensino superior',
  'nivel tecnico', 'lingua inglesa', 'metodologias ageis', 'controle de estoque',
  'contas a pagar', 'contas a receber', 'rotinas administrativas', 'emissao de notas',
  'prospeccao de clientes', 'fechamento de vendas', 'pos venda', 'suporte tecnico',
  'redes sociais', 'midias sociais', 'analise de dados', 'banco de dados',
  'desenvolvimento web', 'react native', 'node js', 'nao conformidades',
];

/** Ferramentas e softwares reconhecidos por nome. Usado para separar "tools". */
const KNOWN_TOOLS = [
  'excel', 'word', 'powerpoint', 'office', 'sap', 'totvs', 'protheus', 'salesforce', 'hubspot',
  'pipedrive', 'rd station', 'zendesk', 'jira', 'trello', 'asana', 'notion', 'slack', 'teams',
  'canva', 'photoshop', 'illustrator', 'figma', 'autocad', 'solidworks', 'power bi', 'tableau',
  'looker', 'sql', 'python', 'java', 'javascript', 'typescript', 'react', 'angular', 'vue',
  'node', 'php', 'laravel', 'django', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'git',
  'github', 'gitlab', 'linux', 'mysql', 'postgresql', 'mongodb', 'oracle', 'firebase',
  'google analytics', 'meta ads', 'google ads', 'crm', 'erp', 'omie', 'bling', 'conta azul',
];

function tokens(text: string): string[] {
  return normalizeForCompare(text).split(' ').filter(Boolean);
}

/**
 * Termos relevantes de um texto, do mais frequente ao menos.
 *
 * Frequência simples, sem TF-IDF: não há corpus de referência aqui, e inventar
 * um pesaria o bundle sem melhorar a ordem numa descrição de vaga de 300
 * palavras.
 */
export function extractKeywords(text: string, limit = 25): string[] {
  const normalized = normalizeForCompare(text);
  const counts = new Map<string, number>();

  for (const term of MULTIWORD_TERMS) {
    const occurrences = normalized.split(term).length - 1;
    if (occurrences > 0) counts.set(term, occurrences * 3);
  }

  for (const token of tokens(text)) {
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    if (/^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

/** Quais dos termos conhecidos aparecem no texto. */
export function extractTools(text: string): string[] {
  const normalized = normalizeForCompare(text);
  return KNOWN_TOOLS.filter((tool) => normalized.includes(tool));
}

/**
 * Tenta achar o cargo na descrição da vaga.
 *
 * Heurística deliberadamente conservadora: só reconhece os padrões explícitos
 * ("Vaga: X", "Cargo: X") e a primeira linha curta. Chutar um cargo errado é
 * pior do que devolver vazio — vazio a pessoa corrige, errado ela não percebe.
 */
export function guessRole(text: string): string {
  const labelled = /(?:vaga|cargo|posicao|posição|função|funcao)\s*[:\-]\s*(.{3,80})/i.exec(text);
  if (labelled) return labelled[1].split('\n')[0].trim();

  const firstLine = text.trim().split('\n')[0]?.trim() ?? '';
  if (firstLine.length >= 3 && firstLine.length <= 80) return firstLine;
  return '';
}

/** Termos da vaga que já aparecem no texto do currículo. */
export function coveredTerms(terms: string[], resumeText: string): string[] {
  const normalized = normalizeForCompare(resumeText);
  return terms.filter((term) => normalized.includes(term));
}

/** Termos da vaga ausentes do currículo. */
export function missingTerms(terms: string[], resumeText: string): string[] {
  const covered = new Set(coveredTerms(terms, resumeText));
  return terms.filter((term) => !covered.has(term));
}

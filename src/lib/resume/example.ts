import type { ResumeContent } from '@/types/resume';

/**
 * Currículo de exemplo usado APENAS na vitrine da landing page.
 *
 * REGRA QUE VALE AQUI: isto é ilustração, não usuário. Em toda tela onde
 * aparece, vem acompanhado de um selo "Exemplo ilustrativo" visível. Nunca
 * deve ser apresentado como currículo de uma pessoa real, nem entrar no banco,
 * nem servir de conteúdo inicial para quem se cadastra — quem cria conta
 * começa com o formulário em branco, com nome e e-mail da própria conta.
 *
 * Os dados de contato são propositalmente inertes: telefone com prefixo de
 * documentação e domínio `exemplo.com`, que não pertence a ninguém.
 */
export const EXAMPLE_RESUME: ResumeContent = {
  title: 'Exemplo ilustrativo',
  variant: 'administrativo',
  template: 'moderno',
  personal: {
    fullName: 'Ana Ribeiro',
    city: 'Fortaleza',
    state: 'CE',
    phone: '(00) 00000-0000',
    email: 'ana@exemplo.com',
    linkedin: 'linkedin.com/in/exemplo',
    portfolio: '',
    website: '',
  },
  goal: {
    targetRole: 'Assistente administrativo',
    area: 'Administrativo',
    summary:
      'Atuação de três anos em atendimento ao cliente no varejo, com rotina de caixa, organização de estoque e apoio ao setor de vendas. Busco uma posição administrativa onde possa aplicar experiência com sistemas de gestão e organização de processos.',
  },
  experiences: [
    {
      id: 'exemplo-experiencia-1',
      company: 'Comércio Aurora',
      role: 'Assistente de atendimento',
      startDate: '2022-03',
      endDate: '',
      current: true,
      description:
        'Atendimento ao cliente e suporte durante o processo de vendas, contribuindo para uma experiência de compra mais eficiente.',
      responsibilities: [
        'Registro de pedidos e emissão de notas no sistema da loja',
        'Organização e conferência do estoque',
      ],
      achievements: [],
    },
    {
      id: 'exemplo-experiencia-2',
      company: 'Mercado Bom Dia',
      role: 'Operadora de caixa',
      startDate: '2020-08',
      endDate: '2022-02',
      current: false,
      description: 'Operação de caixa e conferência de valores no fechamento do turno.',
      responsibilities: [],
      achievements: [],
    },
  ],
  education: [
    {
      id: 'exemplo-formacao-1',
      institution: 'Escola Estadual Central',
      course: 'Ensino médio',
      degree: 'Ensino médio completo',
      startDate: '2017-02',
      endDate: '2019-12',
      status: 'concluido',
    },
  ],
  certifications: [
    { id: 'exemplo-curso-1', name: 'Excel básico ao intermediário', institution: 'Curso livre', year: '2023' },
  ],
  skills: [
    { id: 'exemplo-hab-1', name: 'Atendimento ao cliente', kind: 'tecnica' },
    { id: 'exemplo-hab-2', name: 'Rotinas administrativas', kind: 'tecnica' },
    { id: 'exemplo-hab-3', name: 'Controle de estoque', kind: 'tecnica' },
    { id: 'exemplo-hab-4', name: 'Organização', kind: 'comportamental' },
    { id: 'exemplo-hab-5', name: 'Comunicação', kind: 'comportamental' },
  ],
  languages: [],
  projects: [],
  activities: [],
};

/**
 * Resultado de análise que acompanha o currículo de exemplo.
 *
 * Números fixos e escritos à mão — nenhuma IA é chamada para renderizar a
 * landing page. Se um dia virarem uma análise real, o selo de exemplo sai
 * junto; enquanto forem ilustração, ele fica.
 */
export const EXAMPLE_ANALYSIS = {
  compatibilidade: 78,
  encontrados: ['atendimento ao cliente', 'controle de estoque', 'rotinas administrativas'],
  lacuna: 'Excel avançado',
  sugestao: 'Inclua apenas se você realmente domina — a vaga cita, seu currículo não mostra.',
} as const;

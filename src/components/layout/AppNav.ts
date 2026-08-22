import type { IconName } from '@/components/ui/Icon';

/**
 * Itens de navegação do painel, num lugar só.
 *
 * A barra lateral do desktop, o menu do celular e o painel inicial leem desta
 * mesma lista. Sem isso, acrescentar uma ferramenta significaria lembrar de
 * três arquivos — e o terceiro é sempre o esquecido.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: '/app',
    label: 'Painel',
    icon: 'painel',
    description: 'Visão geral do seu currículo e das suas candidaturas.',
  },
  {
    href: '/app/curriculo',
    label: 'Meu currículo',
    icon: 'documento',
    description: 'Crie e edite seu currículo etapa por etapa.',
  },
  {
    href: '/app/analise',
    label: 'Analisar currículo',
    icon: 'olho',
    description: 'Nota, problemas encontrados e a versão otimizada do seu texto.',
  },
  {
    href: '/app/analisar-vaga',
    label: 'Analisar vaga',
    icon: 'alvo',
    description: 'Cole a descrição da vaga e veja sua compatibilidade.',
  },
  {
    href: '/app/otimizar',
    label: 'Otimizar currículo',
    icon: 'brilho',
    description: 'Gere uma versão do currículo adaptada a uma vaga.',
  },
  {
    href: '/app/carta',
    label: 'Carta de apresentação',
    icon: 'carta',
    description: 'Escreva uma carta personalizada para a candidatura.',
  },
  {
    href: '/app/entrevista',
    label: 'Preparação para entrevista',
    icon: 'conversa',
    description: 'Perguntas prováveis e como responder cada uma.',
  },
  {
    href: '/app/mensagens',
    label: 'Mensagem para recrutador',
    icon: 'chave',
    description: 'Mensagens curtas e profissionais para cada situação.',
  },
  {
    href: '/app/candidaturas',
    label: 'Minhas candidaturas',
    icon: 'lista',
    description: 'Acompanhe empresa, cargo, data e status de cada processo.',
  },
  {
    href: '/app/configuracoes',
    label: 'Configurações',
    icon: 'engrenagem',
    description: 'Sua conta, seus dados e exclusão.',
  },
];

/** Atalhos exibidos como cards no painel. Subconjunto do menu. */
export const DASHBOARD_SHORTCUTS = NAV_ITEMS.filter((item) =>
  ['/app/curriculo', '/app/analise', '/app/analisar-vaga', '/app/otimizar', '/app/carta'].includes(
    item.href
  )
);

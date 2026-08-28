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
  /**
   * O que a tela mostra quando a pessoa ainda não tem currículo salvo.
   *
   * SÓ PARA AS FERRAMENTAS QUE EXIGEM UM CURRÍCULO. Ausente em "Painel",
   * "Meu currículo", "Minhas candidaturas" e "Configurações", que funcionam
   * sem nada salvo — e é essa ausência que a validação de rota de retorno usa
   * para decidir para onde é seguro voltar.
   *
   * O TEXTO É POR FERRAMENTA DE PROPÓSITO. Antes existia um só, compartilhado
   * pelas seis telas: mesmo título ("Você ainda não tem um currículo salvo"),
   * mesmos dois botões, em todas. Quem clicava em "Analisar currículo" via uma
   * tela indistinguível da de "Carta de apresentação", e o efeito relatado foi
   * exatamente esse — "em toda aba que clico aparece criar currículo". A tela
   * vazia é a PRIMEIRA coisa que boa parte das pessoas vê de cada ferramenta;
   * se ela não disser o que aquela ferramenta faz, a ferramenta não existe
   * para quem ainda não tem currículo.
   */
  semCurriculo?: {
    /** Começa pelo VERBO da ferramenta, não pelo que falta. */
    titulo: string;
    /** O que ela devolve depois — a razão de valer a pena enviar o currículo. */
    promessa: string;
  };
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
    semCurriculo: {
      titulo: 'Para analisar, preciso do seu currículo',
      promessa:
        'A análise dá uma nota, aponta o que está errado e reescreve o seu texto. Leva cerca de 20 segundos.',
    },
  },
  {
    href: '/app/analisar-vaga',
    label: 'Analisar vaga',
    icon: 'alvo',
    description: 'Cole a descrição da vaga e veja sua compatibilidade.',
    semCurriculo: {
      titulo: 'Para comparar com a vaga, preciso do seu currículo',
      promessa:
        'A comparação mostra o que a vaga pede, quanto você já atende e o que falta — com honestidade.',
    },
  },
  {
    href: '/app/otimizar',
    label: 'Otimizar currículo',
    icon: 'brilho',
    description: 'Gere uma versão do currículo adaptada a uma vaga.',
    semCurriculo: {
      titulo: 'Para otimizar, preciso do seu currículo',
      promessa:
        'A otimização gera uma versão do seu texto direcionada a uma vaga. Você confere antes de qualquer coisa ser salva.',
    },
  },
  {
    href: '/app/carta',
    label: 'Carta de apresentação',
    icon: 'carta',
    description: 'Escreva uma carta personalizada para a candidatura.',
    semCurriculo: {
      titulo: 'Para escrever a carta, preciso do seu currículo',
      promessa:
        'A carta sai personalizada com a sua experiência e o cargo da vaga, pronta para enviar.',
    },
  },
  {
    href: '/app/entrevista',
    label: 'Preparação para entrevista',
    icon: 'conversa',
    description: 'Perguntas prováveis e como responder cada uma.',
    semCurriculo: {
      titulo: 'Para preparar a entrevista, preciso do seu currículo',
      promessa:
        'A preparação lista as perguntas prováveis para o seu perfil e o que responder em cada uma.',
    },
  },
  {
    href: '/app/mensagens',
    label: 'Mensagem para recrutador',
    icon: 'chave',
    description: 'Mensagens curtas e profissionais para cada situação.',
    semCurriculo: {
      titulo: 'Para escrever a mensagem, preciso do seu currículo',
      promessa:
        'As mensagens saem curtas e profissionais, com a sua experiência, prontas para enviar ao recrutador.',
    },
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

/** A ferramenta daquele endereço, ou `undefined` se o endereço não for de uma. */
export function ferramentaPor(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href);
}

/** Para onde a importação volta quando ninguém pediu nada. */
export const RETORNO_PADRAO = '/app/curriculo';

/**
 * Valida o `?voltar=` da tela de importação.
 *
 * ISTO É UMA DEFESA CONTRA REDIRECIONAMENTO ABERTO, não uma conveniência de
 * tipos. O valor vem da URL, ou seja, de qualquer pessoa que consiga fazer
 * outra clicar num link. Sem validação, `/app/curriculo/importar?voltar=https://
 * site-de-golpe/` faria o NOSSO domínio, já autenticado e com a sessão da
 * pessoa, empurrá-la para fora logo depois de ela importar o currículo — o
 * momento em que ela está mais disposta a confiar no que aparece na tela.
 *
 * A defesa é LISTA DE PERMITIDOS POR IGUALDADE EXATA, e não uma checagem de
 * formato. Não basta exigir que comece com `/`: `//site-de-golpe/` começa com
 * barra e o navegador o lê como URL absoluta com o protocolo atual. Também não
 * basta proibir `://`, que a codificação percentual contorna. Comparar com os
 * endereços que nós mesmos declaramos aqui não tem esse tipo de brecha, porque
 * não interpreta nada — ou o valor é idêntico a um item da lista, ou não é.
 *
 * Só ferramentas COM `semCurriculo` são destino válido, e isso não é detalhe: a
 * lista de retorno é exatamente a lista de telas que mandam a pessoa importar.
 * Uma tela que nunca a manda para lá não tem por que aparecer aqui, e deixar
 * `/app/configuracoes` como retorno legítimo só ampliaria a superfície sem
 * comprar nada.
 */
export function rotaDeRetorno(valor: string | string[] | undefined): string {
  if (typeof valor !== 'string') return RETORNO_PADRAO;
  const item = NAV_ITEMS.find((candidato) => candidato.href === valor);
  return item?.semCurriculo ? item.href : RETORNO_PADRAO;
}

/** Atalhos exibidos como cards no painel. Subconjunto do menu. */
export const DASHBOARD_SHORTCUTS = NAV_ITEMS.filter((item) =>
  ['/app/curriculo', '/app/analise', '/app/analisar-vaga', '/app/otimizar', '/app/carta'].includes(
    item.href
  )
);

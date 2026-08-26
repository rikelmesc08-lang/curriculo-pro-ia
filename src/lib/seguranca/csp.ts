/**
 * Content-Security-Policy — política única, dois lugares de entrega.
 *
 * Este módulo existia só dentro de `src/proxy.ts`. Foi extraído para cá porque
 * a mesma política agora também precisa ser escrita como `<meta
 * http-equiv="Content-Security-Policy">` em `src/app/layout.tsx` — ver o
 * comentário grande abaixo, em `politicaMeta()`, para o motivo. Duplicar a
 * lista de diretivas em dois arquivos era o tipo de divergência silenciosa que
 * este projeto evita: um dia alguém mudaria uma diretiva num lugar só, e o
 * cabeçalho e o `<meta>` sairiam dessincronizados sem nenhum erro avisando.
 *
 * O proxy roda no runtime de borda; o layout roda como Componente de Servidor.
 * Este arquivo não importa nada de `next/server` nem de `next/headers` — só
 * strings — para continuar carregável dos dois lados.
 */

/** Diretivas que a especificação de CSP marca como inválidas dentro de
 * `<meta http-equiv>` (o navegador as ignora e registra aviso no console):
 * `frame-ancestors`, `report-uri` e `sandbox`. Este projeto só usa a primeira;
 * as outras duas nunca apareceram na lista de diretivas — dá para conferir em
 * `politica()` abaixo. */
const DIRETIVAS_INVALIDAS_EM_META = ['frame-ancestors', 'report-uri', 'sandbox'];

/**
 * Monta a política.
 *
 * `frame-ancestors 'none'` é a proteção contra clickjacking, e é a versão
 * moderna do `X-Frame-Options` — que também é enviado, em `next.config.mjs`,
 * para navegadores antigos que ignoram esta diretiva.
 *
 * `object-src 'none'` e `base-uri 'self'` fecham duas portas clássicas de XSS:
 * plugin embutido e sequestro de URL relativa via `<base>`.
 *
 * `form-action 'self'` impede que um XSS aponte um formulário desta origem
 * para um servidor de fora — que é como um dado roubado costuma sair.
 *
 * @param nonce Gerado por requisição (ver `src/proxy.ts`).
 * @param producao `process.env.NODE_ENV === 'production'`.
 * @param opcoes.paraMeta Quando `true`, omite as diretivas inválidas em
 *   `<meta>` (hoje, só `frame-ancestors`). Usado por `politicaMeta()`.
 */
function politicaBase(nonce: string, producao: boolean, opcoes: { paraMeta: boolean }): string {
  const diretivas = [
    "default-src 'self'",
    // `strict-dynamic` faz o navegador confiar no que os scripts com nonce
    // carregarem, e IGNORAR lista de domínios. É o que permite o Next carregar
    // os próprios pedaços de JavaScript sem abrir a política para hosts
    // inteiros. Em desenvolvimento o `unsafe-eval` é inevitável: o recarregador
    // do Next compila em tempo de execução.
    producao
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    // `unsafe-inline` em estilo, e não em script, é a concessão que sobra: o
    // Next e o Tailwind injetam `<style>` e atributos `style` sem nonce. O risco
    // de estilo embutido é ordens de grandeza menor que o de script embutido —
    // não executa código.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    // As fontes são baixadas no build por `next/font` e servidas daqui. Nenhum
    // domínio externo precisa ser liberado.
    "font-src 'self'",
    producao ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ];

  // Em produção, qualquer sub-recurso que escape em http é promovido a https
  // pelo próprio navegador, em vez de virar conteúdo misto bloqueado.
  if (producao) diretivas.push('upgrade-insecure-requests');

  const lista = opcoes.paraMeta
    ? diretivas.filter(
        (diretiva) => !DIRETIVAS_INVALIDAS_EM_META.some((invalida) => diretiva.startsWith(`${invalida} `))
      )
    : diretivas;

  return lista.join('; ');
}

/** Variante para o cabeçalho `Content-Security-Policy` (proxy e, fora da
 * Hostinger, `next.config.mjs` indiretamente via resposta do proxy). Completa
 * — inclui `frame-ancestors`. */
export function politica(nonce: string, producao: boolean): string {
  return politicaBase(nonce, producao, { paraMeta: false });
}

/**
 * Variante para `<meta http-equiv="Content-Security-Policy">` no `<head>`.
 *
 * Existe porque, em produção na Hostinger, o CDN da plataforma (`hcdn`)
 * substitui o cabeçalho `Content-Security-Policy` da resposta por
 * `upgrade-insecure-requests` — comportamento confirmado em 25/08/2026 contra
 * `https://deeppink-albatross-851735.hostingersite.com` e reproduzido em outro
 * site do mesmo servidor. O CDN reescreve cabeçalho de resposta, não o corpo
 * HTML, então um `<meta>` bem no início do `<head>` chega intacto.
 *
 * NÃO inclui `frame-ancestors`: a especificação de CSP marca essa diretiva
 * como inválida dentro de `<meta>` (navegadores a ignoram e avisam no
 * console). Isso não abre brecha de clickjacking porque `X-Frame-Options:
 * DENY`, definido em `next.config.mjs`, chega intacto na Hostinger — foi
 * verificado por `curl -sS -D -` em 25/08/2026, junto com os outros
 * cabeçalhos fixos (`X-Content-Type-Options`, `Referrer-Policy`,
 * `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
 * `Cross-Origin-Resource-Policy`, `Strict-Transport-Security`). É por isso que
 * as duas variantes da política são diferentes por natureza, não por
 * descuido: o `<meta>` cobre o que o corpo HTML pode carregar (XSS); o
 * cabeçalho, quando sobrevive, cobre isso e também quem pode enquadrar a
 * página (clickjacking).
 */
export function politicaMeta(nonce: string, producao: boolean): string {
  return politicaBase(nonce, producao, { paraMeta: true });
}

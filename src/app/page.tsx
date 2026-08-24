import { getSessionUser } from '@/lib/auth/session';
import { checkoutDisponivel } from '@/services/payments';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Hero } from '@/components/landing/Hero';
import { Audience, Benefits, FinalCta, HowItWorks, Integrity, Pricing } from '@/components/landing/Sections';
import { AnalyticsEvent } from '@/components/analytics/AnalyticsEvent';

/**
 * Gerado a cada requisição, não no build.
 *
 * Hoje esta página já é dinâmica de fato: `getSessionUser()` chama `cookies()`
 * por baixo, e isso tira a rota da geração estática sozinho. Mas essa
 * dinamicidade mora em OUTRO arquivo (`lib/auth/session.ts`) — nada aqui
 * garante que ela continue existindo. Um refactor futuro que troque a leitura
 * de sessão da landing por algo sem `cookies()` desligaria, sem ninguém
 * perceber, também a atualidade de `checkoutDisponivel()`: o selo "Em breve"
 * do plano voltaria a poder congelar no valor do momento do build. Declarar
 * `force-dynamic` aqui é o mesmo espírito de `robots.ts` e `sitemap.ts`, que
 * já fazem isso por dependerem de variável de ambiente — e custa zero.
 */
export const dynamic = 'force-dynamic';

/**
 * Landing page.
 *
 * A sessão é lida no servidor para que os CTAs já apontem para o lugar certo
 * na primeira renderização: quem está logado vê "Ir para o painel", não
 * "Criar conta" que depois pisca e troca.
 */
export default async function LandingPage() {
  const user = await getSessionUser();
  const isAuthenticated = Boolean(user);

  return (
    <>
      <SiteHeader isAuthenticated={isAuthenticated} />
      <main id="conteudo">
        <AnalyticsEvent event="landing_view" />
        <Hero isAuthenticated={isAuthenticated} />
        <Benefits />
        <HowItWorks />
        <Audience />
        <Integrity />
        <Pricing isAuthenticated={isAuthenticated} checkoutDisponivel={checkoutDisponivel()} />
        <FinalCta isAuthenticated={isAuthenticated} />
      </main>
      <SiteFooter />
    </>
  );
}

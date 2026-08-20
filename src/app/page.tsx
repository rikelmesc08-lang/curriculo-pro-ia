import { getSessionUser } from '@/lib/auth/session';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { Hero } from '@/components/landing/Hero';
import { Audience, Benefits, FinalCta, HowItWorks, Integrity, Pricing } from '@/components/landing/Sections';
import { AnalyticsEvent } from '@/components/analytics/AnalyticsEvent';

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
        <Pricing isAuthenticated={isAuthenticated} />
        <FinalCta isAuthenticated={isAuthenticated} />
      </main>
      <SiteFooter />
    </>
  );
}

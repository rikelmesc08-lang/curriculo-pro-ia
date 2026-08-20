import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { aiModeIsDemo } from '@/services/ai';
import { AppShell } from '@/components/layout/AppShell';

export const metadata: Metadata = {
  title: 'Painel',
  // Nenhuma tela do painel deve aparecer em buscador: são dados de uma pessoa.
  robots: { index: false, follow: false },
};

/**
 * Layout do painel.
 *
 * A checagem de sessão vive AQUI, no layout, e não em cada página: uma tela
 * nova criada dentro de `/app` já nasce protegida, sem depender de alguém
 * lembrar de chamar `requireUser()`.
 */
export default async function AppLayout({ children }: LayoutProps<'/app'>) {
  const user = await requireUser('/app');

  return (
    <AppShell user={user} aiMode={aiModeIsDemo() ? 'demo' : 'real'}>
      {children}
    </AppShell>
  );
}

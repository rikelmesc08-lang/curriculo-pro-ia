import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForm } from '../_components/AuthForm';

export const metadata: Metadata = {
  title: 'Criar conta',
  description: 'Crie sua conta e monte seu currículo com apoio de inteligência artificial.',
  robots: { index: false, follow: true },
};

export default async function SignUpPage({ searchParams }: PageProps<'/cadastro'>) {
  if (await getSessionUser()) redirect('/app');

  const params = await searchParams;

  // A landing manda `?destino=analisar` no CTA secundário. Traduzimos aqui para
  // que a pessoa caia direto na ferramenta que ela clicou, e não no painel.
  const destino = typeof params.destino === 'string' ? params.destino : undefined;
  const next =
    destino === 'analisar'
      ? '/app/analisar-vaga'
      : typeof params.proximo === 'string'
        ? params.proximo
        : undefined;

  return <AuthForm mode="cadastrar" next={next} />;
}

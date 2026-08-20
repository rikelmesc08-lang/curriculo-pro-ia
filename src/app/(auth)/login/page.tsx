import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { AuthForm } from '../_components/AuthForm';

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesse sua conta do CurrículoPro IA.',
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // Quem já está logado não deveria ver o formulário de novo — o caso comum é
  // clicar em "Entrar" no cabeçalho por hábito.
  if (await getSessionUser()) redirect('/app');

  const params = await searchParams;
  const next = typeof params.proximo === 'string' ? params.proximo : undefined;

  return <AuthForm mode="entrar" next={next} />;
}

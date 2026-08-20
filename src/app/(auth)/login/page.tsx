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

  // Quem acabou de redefinir a senha chega aqui pela ação de recuperação. O
  // aviso confirma que deu certo — sem ele, a pessoa reencontra a tela de login
  // e acha que a troca falhou.
  // Quem chega de `/auth/confirmar` com o código recusado. O texto evita a
  // conclusão errada: link de confirmação vale uma vez só, e quem já clicou
  // antes está confirmado — mandar essa pessoa se cadastrar de novo daria
  // "e-mail já em uso" e a deixaria sem saída.
  const notice =
    params.erro === 'confirmacao'
      ? 'Esse link de confirmação já foi usado ou expirou. Se você já confirmou, é só entrar.'
      : params['senha-redefinida'] !== undefined
        ? 'Senha redefinida. Entre com a senha nova.'
        : undefined;

  return <AuthForm mode="entrar" next={next} notice={notice} />;
}

import type { Metadata } from 'next';
import { RequestResetForm } from '../_components/PasswordResetForms';

export const metadata: Metadata = {
  title: 'Recuperar senha',
  description: 'Receba um link para criar uma senha nova.',
  // Fora do índice: é uma tela transacional, e indexá-la só traria gente
  // caindo aqui pelo buscador em vez de pelo próprio produto.
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ searchParams }: PageProps<'/esqueci-senha'>) {
  const params = await searchParams;

  // `/auth/recuperar` redireciona para cá quando o código do e-mail não serve.
  const erro =
    params.erro === 'link-expirado'
      ? 'Aquele link expirou. Peça um novo abaixo.'
      : params.erro === 'link-invalido'
        ? 'Aquele link não é válido. Peça um novo abaixo.'
        : undefined;

  return <RequestResetForm erro={erro} />;
}

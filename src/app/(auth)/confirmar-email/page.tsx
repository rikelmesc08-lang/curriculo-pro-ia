import type { Metadata } from 'next';
import { ResendConfirmationForm } from '../_components/ResendConfirmationForm';

export const metadata: Metadata = {
  title: 'Confirmar e-mail',
  description: 'Receba um novo link de confirmação da sua conta.',
  // Fora do índice, como as outras telas transacionais: indexá-la só traria
  // gente caindo aqui pelo buscador em vez de pelo próprio produto.
  robots: { index: false, follow: false },
};

export default async function ConfirmEmailPage({ searchParams }: PageProps<'/confirmar-email'>) {
  const params = await searchParams;

  // `/auth/confirmar` redireciona para cá quando o código do e-mail não serve.
  // O texto separa os dois casos porque a conclusão da pessoa muda: link já
  // usado normalmente significa que a conta JÁ ESTÁ confirmada, e mandar essa
  // pessoa pedir outro link seria fazê-la esperar um e-mail inútil.
  const erro =
    params.erro === 'link-expirado'
      ? 'Aquele link expirou. Peça um novo abaixo.'
      : params.erro === 'link-usado'
        ? 'Aquele link já foi usado. Se você já confirmou, é só entrar — se não, peça um novo abaixo.'
        : params.erro === 'link-invalido'
          ? 'Aquele link não é válido. Peça um novo abaixo.'
          : undefined;

  return <ResendConfirmationForm erro={erro} />;
}

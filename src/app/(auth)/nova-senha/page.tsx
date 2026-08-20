import type { Metadata } from 'next';
import { NewPasswordForm } from '../_components/PasswordResetForms';

export const metadata: Metadata = {
  title: 'Criar nova senha',
  robots: { index: false, follow: false },
};

/**
 * Definição da senha nova.
 *
 * O token vem na URL apenas no driver local. NÃO é validado aqui de propósito:
 * validar na renderização e mostrar "link inválido" antes de a pessoa digitar
 * criaria um oráculo para testar tokens em massa sem nem enviar formulário. A
 * checagem acontece no envio, junto com a troca, num passo só.
 */
export default async function NewPasswordPage({ searchParams }: PageProps<'/nova-senha'>) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : undefined;

  return <NewPasswordForm token={token} />;
}

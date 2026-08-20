import { ButtonLink } from '@/components/ui/Button';
import { Logo } from '@/components/layout/Logo';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Logo />
      <p className="mt-8 text-sm font-semibold uppercase tracking-wide text-brand-600">Erro 404</p>
      <h1 className="mt-2 text-2xl font-bold text-ink">Esta página não existe</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        O endereço pode ter mudado, ou o link que te trouxe até aqui está incorreto.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/">Ir para o início</ButtonLink>
        <ButtonLink href="/app" variant="secondary">
          Ir para o painel
        </ButtonLink>
      </div>
    </div>
  );
}

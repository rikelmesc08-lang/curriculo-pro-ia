'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutAction } from '@/lib/auth/actions';
import { cx, initials } from '@/lib/utils';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Feedback';
import { Logo } from './Logo';
import { NAV_ITEMS } from './AppNav';
import type { SessionUser } from '@/types/user';

/**
 * Casca do painel: barra lateral no desktop, gaveta no celular.
 *
 * A responsividade aqui é estrutural, não só de largura. No desktop a lateral
 * é permanente e o conteúdo divide a tela; no celular ela vira sobreposição,
 * porque 260px de menu fixo numa tela de 360px deixaria 100px para o
 * formulário.
 */
export function AppShell({
  user,
  aiMode,
  children,
}: {
  user: SessionUser;
  aiMode: 'real' | 'demo';
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-canvas lg:flex">
      {/* Barra superior — só no celular */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 lg:hidden">
        <Logo href="/app" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-soft"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      {/* Fundo escurecido da gaveta */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar user={user} aiMode={aiMode} pathname={pathname} open={open} onClose={() => setOpen(false)} />

      <div className="min-w-0 flex-1">
        <main id="conteudo" className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  user,
  aiMode,
  pathname,
  open,
  onClose,
}: {
  user: SessionUser;
  aiMode: 'real' | 'demo';
  pathname: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={cx(
        'fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col border-r border-line bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
      aria-label="Navegação do painel"
    >
      <div className="flex h-14 items-center justify-between border-b border-line px-4 lg:h-16">
        <Logo href="/app" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-canvas lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            // `/app` casaria com tudo se usasse `startsWith` — por isso a raiz
            // é comparada por igualdade exata.
            const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  // Fecha a gaveta ao navegar. No celular ela cobre a tela
                  // inteira, e sem isto o menu ficaria por cima da página que a
                  // pessoa acabou de abrir.
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-soft hover:bg-canvas hover:text-ink'
                  )}
                >
                  <Icon name={item.icon} className={cx('h-[18px] w-[18px]', active ? 'text-brand-600' : 'text-muted')} />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {aiMode === 'demo' && (
        <div className="mx-3 mb-3 rounded-lg border border-warning/20 bg-warning-soft px-3 py-2.5">
          <Badge tone="warning">Modo demonstração</Badge>
          <p className="mt-1.5 text-[11px] leading-relaxed text-warning">
            A IA real não está configurada. Os resultados vêm de regras fixas sobre o que você
            digitou, e ficam marcados como demonstração.
          </p>
        </div>
      )}

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 px-1 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
            {initials(user.name || user.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{user.name || 'Sem nome'}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-canvas"
          >
            <Icon name="sair" className="h-[18px] w-[18px] text-muted" />
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}

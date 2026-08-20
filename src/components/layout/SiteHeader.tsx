'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { Logo } from './Logo';
import { cx } from '@/lib/utils';

/**
 * Cabeçalho das páginas públicas.
 *
 * É componente de cliente por causa de uma coisa só: o menu do celular. A
 * decisão de mostrar "Entrar" ou "Ir para o painel" vem do servidor por prop,
 * para não haver flash de estado errado enquanto o JavaScript carrega.
 */

const LINKS = [
  { href: '/#recursos', label: 'Recursos' },
  { href: '/#como-funciona', label: 'Como funciona' },
  { href: '/#para-quem', label: 'Para quem é' },
  { href: '/#planos', label: 'Planos' },
];

export function SiteHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {isAuthenticated ? (
            <ButtonLink href="/app" size="sm">
              Ir para o painel
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Entrar
              </ButtonLink>
              <ButtonLink href="/cadastro" size="sm">
                Criar meu currículo
              </ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-soft lg:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <div
        id="menu-mobile"
        className={cx('border-t border-line bg-surface lg:hidden', open ? 'block' : 'hidden')}
      >
        <nav aria-label="Navegação principal" className="container-page flex flex-col py-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-3 text-sm font-medium text-ink-soft hover:bg-brand-50"
            >
              {link.label}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
            {isAuthenticated ? (
              <ButtonLink href="/app" block>
                Ir para o painel
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/cadastro" block>
                  Criar meu currículo
                </ButtonLink>
                <ButtonLink href="/login" variant="secondary" block>
                  Entrar
                </ButtonLink>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

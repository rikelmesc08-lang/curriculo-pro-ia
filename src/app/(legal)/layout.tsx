import { getSessionUser } from '@/lib/auth/session';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';

/** Casca das páginas legais — mesmo cabeçalho e rodapé do site público. */
export default async function LegalLayout({ children }: LayoutProps<'/'>) {
  const user = await getSessionUser();

  return (
    <>
      <SiteHeader isAuthenticated={Boolean(user)} />
      <main id="conteudo" className="bg-surface">
        <div className="container-narrow py-12 md:py-16">
          <article className="prose-legal">{children}</article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

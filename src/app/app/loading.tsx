import { Skeleton } from '@/components/ui/Spinner';

/**
 * Estado de carregamento do painel.
 *
 * Blocos com a forma aproximada do conteúdo real, e não um spinner centralizado:
 * a página não "salta" quando o conteúdo chega, e a pessoa já entende o que vai
 * aparecer ali.
 */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando...</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-32 w-full rounded-card" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-32 rounded-card" />
        <Skeleton className="h-32 rounded-card" />
      </div>
    </div>
  );
}

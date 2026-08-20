'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

/**
 * Lista de itens que o usuário adiciona e remove (experiências, formações,
 * cursos, idiomas...).
 *
 * Um componente só para todas porque o comportamento é idêntico e o risco de
 * divergir é alto: em nove listas duplicadas, alguma acabaria sem confirmação
 * de remoção ou sem estado vazio.
 *
 * A remoção pede confirmação inline no próprio card — `window.confirm` bloqueia
 * a página inteira e, em app rodando dentro de webview, às vezes nem aparece.
 */
export function RepeatableList<T extends { id: string }>({
  items,
  onAdd,
  onRemove,
  addLabel,
  emptyTitle,
  emptyDescription,
  titleFor,
  children,
}: {
  items: T[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  addLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  titleFor: (item: T, index: number) => string;
  children: (item: T, index: number) => ReactNode;
}) {
  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-line-strong bg-canvas px-5 py-8 text-center">
          <p className="text-sm font-semibold text-ink">{emptyTitle}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{emptyDescription}</p>
        </div>
      )}

      {items.map((item, index) => (
        <fieldset key={item.id} className="rounded-lg border border-line bg-canvas p-4">
          <legend className="flex w-full items-center justify-between gap-3 px-1">
            <span className="text-sm font-semibold text-ink">{titleFor(item, index)}</span>
            <RemoveButton onConfirm={() => onRemove(item.id)} />
          </legend>
          <div className="mt-3 space-y-4">{children(item, index)}</div>
        </fieldset>
      ))}

      <Button type="button" variant="secondary" onClick={onAdd}>
        <Icon name="mais" className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

function RemoveButton({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);

  if (asking) {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-muted">Remover mesmo?</span>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-danger-soft px-2 py-1 font-semibold text-danger"
        >
          Sim, remover
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-md px-2 py-1 font-medium text-ink-soft hover:bg-line"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAsking(true)}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-danger-soft hover:text-danger"
    >
      <Icon name="lixeira" className="h-3.5 w-3.5" />
      Remover
    </button>
  );
}

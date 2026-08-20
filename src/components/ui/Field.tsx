'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/utils';

/**
 * Campos de formulário.
 *
 * O rótulo, a dica e a mensagem de erro são amarrados ao input por id —
 * `htmlFor`, `aria-describedby` e `aria-invalid`. Num formulário de sete
 * etapas, essa ligação é a diferença entre "campo obrigatório" ser lido junto
 * do campo certo ou ficar solto no meio da página.
 */

const controlBase =
  'block w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 transition-colors disabled:bg-canvas disabled:text-muted';

function controlClasses(invalid: boolean, className?: string): string {
  return cx(
    controlBase,
    invalid ? 'border-danger focus:border-danger' : 'border-line-strong focus:border-brand-500',
    className
  );
}

interface WrapperProps {
  label: string;
  hint?: string;
  error?: string;
  /** Marca o campo como opcional na interface, em vez de marcar os obrigatórios. */
  optional?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, optional, children, className }: WrapperProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-ink-soft">
        {label}
        {optional && <span className="text-xs font-normal text-muted">opcional</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  wrapperClassName?: string;
};

export function TextField({ label, hint, error, optional, wrapperClassName, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          {...rest}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={controlClasses(invalid)}
        />
      )}
    </Field>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  wrapperClassName?: string;
};

export function TextAreaField({ label, hint, error, optional, wrapperClassName, rows = 4, ...rest }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          {...rest}
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={controlClasses(invalid, 'resize-y leading-relaxed')}
        />
      )}
    </Field>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> & {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  wrapperClassName?: string;
  options: { value: string; label: string }[];
};

export function SelectField({
  label,
  hint,
  error,
  optional,
  wrapperClassName,
  options,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={wrapperClassName}>
      {({ id, describedBy, invalid }) => (
        <select
          {...rest}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={controlClasses(invalid, 'appearance-none bg-[length:1rem] pr-9')}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%236b7280'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5' stroke='%236b7280' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.65rem center',
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

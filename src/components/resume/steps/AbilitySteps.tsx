'use client';

import { useState } from 'react';
import { LANGUAGE_LEVELS, type Language, type SkillKind } from '@/types/resume';
import { emptyLanguage, emptySkill } from '@/lib/resume/draft';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { RepeatableList } from '../RepeatableList';
import type { StepProps } from '../types';

/**
 * Etapas de competências e idiomas.
 *
 * Competência usa entrada por "chips": digitar e apertar Enter. É a interação
 * mais rápida para uma lista de itens curtos, e evita quinze campos de texto
 * empilhados na tela do celular.
 */

export function SkillsStep({ content, update }: StepProps) {
  const technical = content.skills.filter((skill) => skill.kind === 'tecnica');
  const behavioral = content.skills.filter((skill) => skill.kind === 'comportamental');

  function add(kind: SkillKind, name: string) {
    const clean = name.trim();
    if (!clean) return;
    // Evita o mesmo termo duas vezes no currículo — repetição em lista de
    // competências passa impressão de descuido.
    const exists = content.skills.some(
      (skill) => skill.kind === kind && skill.name.toLowerCase() === clean.toLowerCase()
    );
    if (exists) return;
    update((previous) => ({ ...previous, skills: [...previous.skills, { ...emptySkill(kind), name: clean }] }));
  }

  function remove(id: string) {
    update((previous) => ({ ...previous, skills: previous.skills.filter((skill) => skill.id !== id) }));
  }

  return (
    <div className="space-y-6">
      <Alert tone="neutral">
        Liste só o que você usaria numa conversa técnica sem hesitar. Competência inflada aparece na
        primeira pergunta prática.
      </Alert>

      <SkillGroup
        title="Competências técnicas"
        description="Ferramentas, sistemas, métodos e conhecimentos específicos da sua área."
        placeholder="Ex.: Excel, atendimento em CRM, emissão de notas"
        items={technical}
        onAdd={(value) => add('tecnica', value)}
        onRemove={remove}
      />

      <SkillGroup
        title="Competências comportamentais"
        description="Como você trabalha com outras pessoas e sob pressão."
        placeholder="Ex.: Comunicação, organização, trabalho em equipe"
        items={behavioral}
        onAdd={(value) => add('comportamental', value)}
        onRemove={remove}
      />
    </div>
  );
}

function SkillGroup({
  title,
  description,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  placeholder: string;
  items: { id: string; name: string }[];
  onAdd: (value: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function submit() {
    onAdd(draft);
    setDraft('');
  }

  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">{description}</p>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              // O formulário inteiro não deve ser enviado por causa de um
              // Enter num campo de chip.
              event.preventDefault();
              submit();
            }
          }}
          aria-label={`Adicionar em ${title}`}
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted/70"
        />
        <Button type="button" variant="secondary" onClick={submit} disabled={draft.trim().length === 0}>
          Adicionar
        </Button>
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-3 pr-1.5 text-sm text-brand-900">
                {item.name}
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remover ${item.name}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-brand-700 hover:bg-brand-200"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">Nenhuma adicionada ainda.</p>
      )}
    </div>
  );
}

export function LanguagesStep({ content, update }: StepProps) {
  function patch(id: string, changes: Partial<Language>) {
    update((previous) => ({
      ...previous,
      languages: previous.languages.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  return (
    <div className="space-y-5">
      <Alert tone="neutral">
        Seja honesto no nível. &quot;Inglês avançado&quot; costuma ser testado na entrevista, às vezes sem
        aviso.
      </Alert>

      <RepeatableList
        items={content.languages}
        addLabel="Adicionar idioma"
        emptyTitle="Nenhum idioma registrado"
        emptyDescription="Se a vaga não pede idioma, esta seção é opcional."
        titleFor={(item, index) => item.name || `Idioma ${index + 1}`}
        onAdd={() => update((previous) => ({ ...previous, languages: [...previous.languages, emptyLanguage()] }))}
        onRemove={(id) =>
          update((previous) => ({ ...previous, languages: previous.languages.filter((item) => item.id !== id) }))
        }
      >
        {(item) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Idioma"
              value={item.name}
              onChange={(event) => patch(item.id, { name: event.target.value })}
              placeholder="Inglês"
            />
            <SelectField
              label="Nível"
              value={item.level}
              onChange={(event) => patch(item.id, { level: event.target.value as Language['level'] })}
              options={LANGUAGE_LEVELS.map((level) => ({ value: level.id, label: level.label }))}
            />
          </div>
        )}
      </RepeatableList>

      <p className="flex items-start gap-2 text-xs text-muted">
        <Icon name="aviso" className="mt-0.5 h-4 w-4 shrink-0" />
        A IA nunca acrescenta um idioma que você não cadastrou aqui.
      </p>
    </div>
  );
}

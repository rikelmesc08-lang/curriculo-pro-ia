'use client';

import { ButtonLink } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';

/**
 * Peças repetidas nas cinco ferramentas de IA.
 *
 * Cada ferramenta precisa da mesma coisa: um lugar para colar a vaga, e um
 * aviso decente quando ainda não existe currículo. Repetir isso cinco vezes
 * levaria a cinco textos ligeiramente diferentes para a mesma situação.
 */

export function JobDescriptionInput({
  value,
  onChange,
  label = 'Cole aqui a descrição da vaga',
  hint = 'Copie o anúncio inteiro, incluindo requisitos e responsabilidades. Quanto mais completo, melhor a análise.',
  rows = 10,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <div>
      <TextAreaField
        label={label}
        hint={hint}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={'Ex.: Vaga: Assistente Administrativo\n\nResponsabilidades:\n- Emissão de notas fiscais\n- Controle de contas a pagar\n\nRequisitos:\n- Ensino médio completo\n- Excel intermediário'}
      />
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Icon name="documento" className="h-3.5 w-3.5" />
        {value.trim().length > 0
          ? `${value.trim().length} caracteres colados. A vaga fica disponível nas outras ferramentas enquanto esta aba estiver aberta.`
          : 'A vaga colada aqui fica disponível nas outras ferramentas enquanto esta aba estiver aberta.'}
      </p>
    </div>
  );
}

/** Exibido quando a ferramenta depende de um currículo que ainda não existe. */
export function NoResumeNotice({ tool }: { tool: string }) {
  return (
    <EmptyState
      title="Você ainda não tem um currículo salvo"
      description={`${tool} trabalha em cima do seu currículo. Preencha o formulário guiado primeiro — leva alguns minutos e fica salvo automaticamente.`}
      action={
        <ButtonLink href="/app/curriculo" className="uppercase tracking-wide">
          Criar meu currículo
        </ButtonLink>
      }
    />
  );
}

/** Lista de itens em pílulas — competências, ferramentas, palavras-chave. */
export function ChipList({ items, tone = 'neutral' }: { items: string[]; tone?: 'neutral' | 'brand' | 'danger' }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Nada identificado.</p>;
  }

  const classes =
    tone === 'brand'
      ? 'border-brand-200 bg-brand-50 text-brand-900'
      : tone === 'danger'
        ? 'border-danger/20 bg-danger-soft text-danger'
        : 'border-line bg-canvas text-ink-soft';

  // O modelo repete termo com alguma frequência (o mesmo "Excel" saindo em
  // skills e em tools, por exemplo). Sem remover a repetição, duas pílulas
  // iguais recebem a mesma chave de React — que avisa no console e pode
  // reaproveitar o nó errado numa atualização — e a tela ainda mostra o termo
  // duas vezes, o que parece defeito para quem lê.
  //
  // A comparação ignora caixa e espaço nas pontas; a primeira grafia é a que
  // fica, porque costuma ser a que o modelo tratou como principal.
  const vistos = new Set<string>();
  const unicos = items.filter((item) => {
    const chave = item.trim().toLowerCase();
    if (!chave || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  if (unicos.length === 0) {
    return <p className="text-sm text-muted">Nada identificado.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {unicos.map((item) => (
        <li key={item} className={`rounded-full border px-3 py-1 text-sm ${classes}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

'use client';

import { useActionState, useEffect, useRef } from 'react';
import { createApplicationAction } from '@/server/actions/applications';
import { idleFormState } from '@/lib/forms/state';
import { APPLICATION_STATUSES } from '@/types/application';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';

/**
 * Formulário de nova candidatura.
 *
 * `<form action>` puro: funciona sem JavaScript e o navegador cuida do envio.
 * O `useActionState` só acrescenta a exibição do erro e o estado de envio.
 *
 * O formulário é limpo no sucesso — registrar candidatura é uma ação repetida
 * várias vezes seguidas, e deixar os campos preenchidos faria a pessoa apagar
 * tudo à mão antes da próxima.
 */
export function ApplicationForm() {
  const [state, formAction, pending] = useActionState(createApplicationAction, idleFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4" noValidate>
      {state.status === 'error' && state.message && <Alert tone="danger">{state.message}</Alert>}
      {state.status === 'success' && state.message && <Alert tone="success">{state.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Empresa" name="company" required error={state.fieldErrors?.company} />
        <TextField label="Cargo" name="role" required error={state.fieldErrors?.role} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Data da candidatura" name="appliedAt" type="date" optional />
        <SelectField
          label="Status"
          name="status"
          defaultValue="aplicado"
          options={APPLICATION_STATUSES.map((status) => ({ value: status.id, label: status.label }))}
        />
      </div>

      <TextField label="Link da vaga" name="link" optional placeholder="https://..." />

      <TextAreaField
        label="Anotações"
        name="notes"
        optional
        rows={3}
        hint="Nome de quem te atendeu, faixa salarial combinada, o que ficou de próximo passo."
      />

      <Button type="submit" loading={pending} loadingLabel="Salvando...">
        Registrar candidatura
      </Button>
    </form>
  );
}

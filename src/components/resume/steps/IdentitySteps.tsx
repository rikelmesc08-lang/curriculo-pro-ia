'use client';

import { RESUME_VARIANTS } from '@/types/resume';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { SummaryRewrite } from '../AiRewrite';
import type { StepProps } from '../types';

/**
 * Etapas 1 e 2: dados pessoais e objetivo profissional.
 *
 * Não pedimos endereço residencial completo, e isso é decisão de privacidade,
 * não esquecimento: rua e número não ajudam em nada na triagem, e um currículo
 * circula por muitas caixas de entrada. Cidade e estado bastam para o
 * recrutador saber se a pessoa está na região da vaga.
 */

export function PersonalStep({ content, update }: StepProps) {
  function setField(field: keyof typeof content.personal, value: string) {
    update((previous) => ({ ...previous, personal: { ...previous.personal, [field]: value } }));
  }

  return (
    <div className="space-y-5">
      <TextField
        label="Nome completo"
        value={content.personal.fullName}
        onChange={(event) => setField('fullName', event.target.value)}
        autoComplete="name"
        placeholder="Como você assina profissionalmente"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Cidade"
          value={content.personal.city}
          onChange={(event) => setField('city', event.target.value)}
          autoComplete="address-level2"
        />
        <TextField
          label="Estado"
          value={content.personal.state}
          onChange={(event) => setField('state', event.target.value)}
          autoComplete="address-level1"
          placeholder="UF"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Telefone"
          value={content.personal.phone}
          onChange={(event) => setField('phone', event.target.value)}
          autoComplete="tel"
          inputMode="tel"
          placeholder="(00) 00000-0000"
        />
        <TextField
          label="E-mail"
          value={content.personal.email}
          onChange={(event) => setField('email', event.target.value)}
          autoComplete="email"
          inputMode="email"
          type="email"
        />
      </div>

      <TextField
        label="LinkedIn"
        optional
        value={content.personal.linkedin}
        onChange={(event) => setField('linkedin', event.target.value)}
        placeholder="linkedin.com/in/seu-perfil"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Portfólio"
          optional
          value={content.personal.portfolio}
          onChange={(event) => setField('portfolio', event.target.value)}
          placeholder="behance.net/voce"
        />
        <TextField
          label="Site"
          optional
          value={content.personal.website}
          onChange={(event) => setField('website', event.target.value)}
          placeholder="seusite.com.br"
        />
      </div>

      <Alert tone="neutral">
        Não pedimos endereço completo de propósito. Cidade e estado bastam para a triagem, e um
        currículo passa por muita gente.
      </Alert>
    </div>
  );
}

export function GoalStep({ content, update, jobDescription }: StepProps) {
  function setGoal(field: keyof typeof content.goal, value: string) {
    update((previous) => ({ ...previous, goal: { ...previous.goal, [field]: value } }));
  }

  return (
    <div className="space-y-5">
      <SelectField
        label="Tipo de currículo"
        value={content.variant}
        onChange={(event) =>
          update((previous) => ({ ...previous, variant: event.target.value as typeof previous.variant }))
        }
        options={RESUME_VARIANTS.map((variant) => ({ value: variant.id, label: variant.label }))}
        hint={RESUME_VARIANTS.find((variant) => variant.id === content.variant)?.hint}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Cargo desejado"
          value={content.goal.targetRole}
          onChange={(event) => setGoal('targetRole', event.target.value)}
          placeholder="Assistente administrativo"
        />
        <TextField
          label="Área profissional"
          value={content.goal.area}
          onChange={(event) => setGoal('area', event.target.value)}
          placeholder="Administrativo"
        />
      </div>

      <TextAreaField
        label="Resumo profissional"
        rows={6}
        value={content.goal.summary}
        onChange={(event) => setGoal('summary', event.target.value)}
        hint="Quatro a seis linhas sobre a sua área, o que você já fez e o que busca. Escreva do seu jeito — a IA melhora a redação depois."
        placeholder="Ex.: Atuo há três anos com atendimento ao cliente no varejo, com rotina de caixa e organização de estoque. Busco uma posição administrativa onde possa usar minha experiência com sistemas e organização de processos."
      />

      <SummaryRewrite
        content={content}
        jobDescription={jobDescription}
        onApply={(text) => setGoal('summary', text)}
      />
    </div>
  );
}

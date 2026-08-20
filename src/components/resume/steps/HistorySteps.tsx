'use client';

import { EDUCATION_STATUS, type Activity, type Certification, type Education, type Experience, type Project } from '@/types/resume';
import { linesToList, listToLines } from '@/lib/utils';
import {
  emptyActivity,
  emptyCertification,
  emptyEducation,
  emptyExperience,
  emptyProject,
  isEntryLevel,
} from '@/lib/resume/draft';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { RepeatableList } from '../RepeatableList';
import { ExperienceRewrite } from '../AiRewrite';
import type { StepProps } from '../types';

/**
 * Etapas de histórico: experiência, formação, cursos, projetos e atividades.
 *
 * Responsabilidades e resultados são digitados como texto multilinha e
 * guardados como lista. Um "adicionar item" com botãozinho por linha parece
 * mais sofisticado e é bem pior de usar no celular — digitar e apertar Enter
 * ganha de tocar num alvo de 24px oito vezes seguidas.
 */

export function ExperienceStep({ content, update, jobDescription }: StepProps) {
  const entryLevel = isEntryLevel(content.variant);

  function patch(id: string, changes: Partial<Experience>) {
    update((previous) => ({
      ...previous,
      experiences: previous.experiences.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  return (
    <div className="space-y-5">
      {entryLevel && (
        <Alert tone="info">
          Sem experiência registrada? Pule esta etapa. Trabalho informal, ajuda no negócio da
          família e freelas contam — se você teve algum, vale registrar aqui.
        </Alert>
      )}

      <RepeatableList
        items={content.experiences}
        addLabel="Adicionar experiência"
        emptyTitle="Nenhuma experiência registrada"
        emptyDescription={
          entryLevel
            ? 'Tudo bem começar sem nenhuma. As etapas de projetos e atividades cuidam do seu lastro.'
            : 'Comece pela mais recente — é a que o recrutador lê primeiro.'
        }
        titleFor={(item, index) => item.role || item.company || `Experiência ${index + 1}`}
        onAdd={() =>
          update((previous) => ({ ...previous, experiences: [...previous.experiences, emptyExperience()] }))
        }
        onRemove={(id) =>
          update((previous) => ({
            ...previous,
            experiences: previous.experiences.filter((item) => item.id !== id),
          }))
        }
      >
        {(experience) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Empresa"
                value={experience.company}
                onChange={(event) => patch(experience.id, { company: event.target.value })}
              />
              <TextField
                label="Cargo"
                value={experience.role}
                onChange={(event) => patch(experience.id, { role: event.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Início"
                type="month"
                value={experience.startDate}
                onChange={(event) => patch(experience.id, { startDate: event.target.value })}
              />
              <TextField
                label="Saída"
                type="month"
                value={experience.endDate}
                disabled={experience.current}
                onChange={(event) => patch(experience.id, { endDate: event.target.value })}
                hint={experience.current ? 'Desabilitado: marcado como emprego atual.' : undefined}
              />
            </div>

            <label className="flex items-center gap-2.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                checked={experience.current}
                onChange={(event) => patch(experience.id, { current: event.target.checked })}
                className="h-4 w-4 rounded border-line-strong text-brand-600"
              />
              Trabalho aqui atualmente
            </label>

            <TextAreaField
              label="Descrição"
              rows={4}
              value={experience.description}
              onChange={(event) => patch(experience.id, { description: event.target.value })}
              hint="O que você fazia no dia a dia. Escreva simples — a IA deixa profissional depois."
              placeholder="Ex.: Atendia clientes e fazia vendas."
            />

            <TextAreaField
              label="Principais responsabilidades"
              rows={4}
              value={listToLines(experience.responsibilities)}
              onChange={(event) =>
                patch(experience.id, { responsibilities: linesToList(event.target.value) })
              }
              hint="Uma por linha."
              optional
            />

            <TextAreaField
              label="Resultados e conquistas"
              rows={3}
              value={listToLines(experience.achievements)}
              onChange={(event) => patch(experience.id, { achievements: linesToList(event.target.value) })}
              hint="Só o que for verdade e você conseguir sustentar numa entrevista. A IA nunca cria número aqui."
              optional
            />

            <ExperienceRewrite
              content={content}
              experienceId={experience.id}
              jobDescription={jobDescription}
              onApply={(value) => patch(experience.id, value)}
            />
          </>
        )}
      </RepeatableList>
    </div>
  );
}

export function EducationStep({ content, update }: StepProps) {
  function patch(id: string, changes: Partial<Education>) {
    update((previous) => ({
      ...previous,
      education: previous.education.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  return (
    <RepeatableList
      items={content.education}
      addLabel="Adicionar formação"
      emptyTitle="Nenhuma formação registrada"
      emptyDescription="Inclua também cursos em andamento, trancados ou incompletos — o status deixa isso claro."
      titleFor={(item, index) => item.course || item.institution || `Formação ${index + 1}`}
      onAdd={() => update((previous) => ({ ...previous, education: [...previous.education, emptyEducation()] }))}
      onRemove={(id) =>
        update((previous) => ({ ...previous, education: previous.education.filter((item) => item.id !== id) }))
      }
    >
      {(item) => (
        <>
          <TextField
            label="Instituição"
            value={item.institution}
            onChange={(event) => patch(item.id, { institution: event.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Curso"
              value={item.course}
              onChange={(event) => patch(item.id, { course: event.target.value })}
            />
            <TextField
              label="Grau"
              value={item.degree}
              onChange={(event) => patch(item.id, { degree: event.target.value })}
              placeholder="Ensino médio, Técnico, Bacharelado..."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Início"
              type="month"
              value={item.startDate}
              onChange={(event) => patch(item.id, { startDate: event.target.value })}
            />
            <TextField
              label="Conclusão"
              type="month"
              value={item.endDate}
              onChange={(event) => patch(item.id, { endDate: event.target.value })}
            />
            <SelectField
              label="Status"
              value={item.status}
              onChange={(event) => patch(item.id, { status: event.target.value as Education['status'] })}
              options={EDUCATION_STATUS.map((status) => ({ value: status.id, label: status.label }))}
            />
          </div>
        </>
      )}
    </RepeatableList>
  );
}

export function CertificationStep({ content, update }: StepProps) {
  function patch(id: string, changes: Partial<Certification>) {
    update((previous) => ({
      ...previous,
      certifications: previous.certifications.map((item) =>
        item.id === id ? { ...item, ...changes } : item
      ),
    }));
  }

  return (
    <div className="space-y-5">
      <Alert tone="neutral">
        Inclua apenas cursos que você realmente concluiu ou está cursando. Certificação inventada é
        checada com uma ligação.
      </Alert>

      <RepeatableList
        items={content.certifications}
        addLabel="Adicionar curso ou certificação"
        emptyTitle="Nenhum curso registrado"
        emptyDescription="Cursos livres, certificações técnicas e treinamentos internos contam."
        titleFor={(item, index) => item.name || `Curso ${index + 1}`}
        onAdd={() =>
          update((previous) => ({ ...previous, certifications: [...previous.certifications, emptyCertification()] }))
        }
        onRemove={(id) =>
          update((previous) => ({
            ...previous,
            certifications: previous.certifications.filter((item) => item.id !== id),
          }))
        }
      >
        {(item) => (
          <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
            <TextField
              label="Nome"
              value={item.name}
              onChange={(event) => patch(item.id, { name: event.target.value })}
            />
            <TextField
              label="Instituição"
              value={item.institution}
              onChange={(event) => patch(item.id, { institution: event.target.value })}
            />
            <TextField
              label="Ano"
              value={item.year}
              inputMode="numeric"
              onChange={(event) => patch(item.id, { year: event.target.value })}
              placeholder="2025"
            />
          </div>
        )}
      </RepeatableList>
    </div>
  );
}

export function ProjectsStep({ content, update }: StepProps) {
  function patch(id: string, changes: Partial<Project>) {
    update((previous) => ({
      ...previous,
      projects: previous.projects.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  return (
    <div className="space-y-5">
      <Alert tone="info">
        Trabalho de conclusão, projeto de sala de aula, freela, site que você montou para um
        conhecido: tudo isso é experiência real e pode entrar no currículo.
      </Alert>

      <RepeatableList
        items={content.projects}
        addLabel="Adicionar projeto"
        emptyTitle="Nenhum projeto registrado"
        emptyDescription="Se você ainda não tem experiência formal, esta é a seção que mostra o que você sabe fazer."
        titleFor={(item, index) => item.name || `Projeto ${index + 1}`}
        onAdd={() => update((previous) => ({ ...previous, projects: [...previous.projects, emptyProject()] }))}
        onRemove={(id) =>
          update((previous) => ({ ...previous, projects: previous.projects.filter((item) => item.id !== id) }))
        }
      >
        {(item) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Nome do projeto"
                value={item.name}
                onChange={(event) => patch(item.id, { name: event.target.value })}
              />
              <TextField
                label="Contexto"
                value={item.context}
                onChange={(event) => patch(item.id, { context: event.target.value })}
                placeholder="Faculdade, curso técnico, pessoal..."
              />
            </div>
            <TextAreaField
              label="O que você fez"
              rows={3}
              value={item.description}
              onChange={(event) => patch(item.id, { description: event.target.value })}
            />
            <TextField
              label="Link"
              optional
              value={item.link}
              onChange={(event) => patch(item.id, { link: event.target.value })}
            />
          </>
        )}
      </RepeatableList>
    </div>
  );
}

export function ActivitiesStep({ content, update }: StepProps) {
  function patch(id: string, changes: Partial<Activity>) {
    update((previous) => ({
      ...previous,
      activities: previous.activities.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
  }

  return (
    <div className="space-y-5">
      <Alert tone="info">
        Voluntariado, grêmio estudantil, atlética, igreja, projeto social, monitoria. Mostram
        responsabilidade e convívio — e são especialmente úteis em primeiro emprego.
      </Alert>

      <RepeatableList
        items={content.activities}
        addLabel="Adicionar atividade"
        emptyTitle="Nenhuma atividade registrada"
        emptyDescription="Atividades extracurriculares e voluntariado contam como experiência."
        titleFor={(item, index) => item.name || `Atividade ${index + 1}`}
        onAdd={() => update((previous) => ({ ...previous, activities: [...previous.activities, emptyActivity()] }))}
        onRemove={(id) =>
          update((previous) => ({ ...previous, activities: previous.activities.filter((item) => item.id !== id) }))
        }
      >
        {(item) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Atividade"
                value={item.name}
                onChange={(event) => patch(item.id, { name: event.target.value })}
              />
              <TextField
                label="Organização"
                value={item.organization}
                onChange={(event) => patch(item.id, { organization: event.target.value })}
              />
            </div>
            <TextField
              label="Período"
              value={item.period}
              onChange={(event) => patch(item.id, { period: event.target.value })}
              placeholder="2023 — 2024"
            />
            <TextAreaField
              label="O que você fazia"
              rows={3}
              value={item.description}
              onChange={(event) => patch(item.id, { description: event.target.value })}
            />
          </>
        )}
      </RepeatableList>
    </div>
  );
}

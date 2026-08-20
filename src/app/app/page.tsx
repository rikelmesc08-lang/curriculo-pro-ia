import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { completeness, toContent } from '@/lib/resume/draft';
import { ACTIVE_STATUSES, APPLICATION_STATUSES } from '@/types/application';
import { firstName, formatDate, pluralize } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Alert, Badge, EmptyState } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { DASHBOARD_SHORTCUTS } from '@/components/layout/AppNav';
import { JourneyProgress, type JourneyStep } from '@/components/dashboard/JourneyProgress';

export const metadata: Metadata = { title: 'Painel' };

/**
 * Painel inicial.
 *
 * Responde três perguntas, nesta ordem: em que pé está meu currículo, o que eu
 * faço agora, e como estão minhas candidaturas. Tudo é lido no servidor — não
 * há estado de cliente aqui, e por isso a página não pisca com dados vazios
 * antes de carregar.
 */
export default async function DashboardPage() {
  const user = await requireUser('/app');
  const repository = await getRepository();

  const [resume, applications] = await Promise.all([
    repository.getLatestResume(user.id),
    repository.listApplications(user.id),
  ]);

  const content = resume ? toContent(resume) : null;
  const status = content ? completeness(content) : null;

  const active = applications.filter((application) => ACTIVE_STATUSES.includes(application.status));
  const interviews = applications.filter((application) => application.status === 'entrevista');
  const approved = applications.filter((application) => application.status === 'aprovado');

  const journey: JourneyStep[] = [
    { label: 'Dados pessoais', href: '/app/curriculo', measured: true, done: Boolean(content?.personal.fullName && content?.personal.email) },
    { label: 'Experiência', href: '/app/curriculo', measured: true, done: Boolean(content && (content.experiences.length > 0 || content.projects.length > 0)) },
    { label: 'Formação', href: '/app/curriculo', measured: true, done: Boolean(content && content.education.length > 0) },
    { label: 'Competências', href: '/app/curriculo', measured: true, done: Boolean(content && content.skills.length >= 3) },
    { label: 'Vaga', href: '/app/analisar-vaga', measured: false },
    { label: 'Otimização', href: '/app/otimizar', measured: false },
    { label: 'Revisão', href: '/app/curriculo', measured: false },
    { label: 'Download', href: '/app/curriculo', measured: false },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">
          Olá, {firstName(user.name) || 'tudo bem'}!
        </h1>
        <p className="mt-1 text-sm text-muted">
          {content
            ? 'Seu currículo está salvo. Continue de onde parou ou adapte-o para uma vaga.'
            : 'Vamos montar seu currículo? Leva alguns minutos e fica salvo automaticamente.'}
        </p>
      </header>

      {!content && (
        <Alert tone="info" title="Você ainda não tem currículo aqui">
          <p>
            Comece pelo formulário guiado. Você escreve do seu jeito e a IA melhora a redação
            depois — sem inventar nada que você não tenha vivido.
          </p>
          <div className="mt-3">
            <ButtonLink href="/app/curriculo" size="sm" className="uppercase tracking-wide">
              Criar meu currículo
            </ButtonLink>
          </div>
        </Alert>
      )}

      {content && status && (
        <Card>
          <CardHeader
            title="Meu currículo"
            description={`Atualizado em ${formatDate(resume!.updatedAt)}`}
            action={
              <ButtonLink href="/app/curriculo" size="sm" variant="secondary">
                Continuar editando
              </ButtonLink>
            }
          />
          <CardBody>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-ink-soft">Completude</p>
              <p className="text-sm font-bold tabular-nums text-ink">{status.percentage}%</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-500"
                style={{ width: `${status.percentage}%` }}
              />
            </div>

            {status.missingEssentials.length > 0 ? (
              <p className="mt-3 text-sm text-muted">
                Falta preencher: {status.missingEssentials.map((item) => item.label).join(', ')}.
              </p>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-success">
                <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                Tudo que é obrigatório está preenchido.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <JourneyProgress steps={journey} />
        </CardBody>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">O que você quer fazer agora?</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DASHBOARD_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.href}>
              <Link
                href={shortcut.href}
                className="flex h-full flex-col rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand-300"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon name={shortcut.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="mt-3 text-sm font-semibold text-ink">{shortcut.label}</span>
                <span className="mt-1 text-xs leading-relaxed text-muted">{shortcut.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <CardHeader
          title="Minhas candidaturas"
          description="Acompanhe cada processo em que você está."
          action={
            <ButtonLink href="/app/candidaturas" size="sm" variant="secondary">
              Ver todas
            </ButtonLink>
          }
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total', value: applications.length },
              { label: 'Processos ativos', value: active.length },
              { label: 'Entrevistas', value: interviews.length },
              { label: 'Aprovados', value: approved.length },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border border-line bg-canvas px-3 py-3">
                <dt className="text-xs font-medium text-muted">{metric.label}</dt>
                <dd className="mt-0.5 text-xl font-bold tabular-nums text-ink">{metric.value}</dd>
              </div>
            ))}
          </dl>

          {applications.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="Nenhuma candidatura registrada"
                description="Anote as vagas em que você se candidatou para não perder o fio de nenhum processo."
                action={
                  <ButtonLink href="/app/candidaturas" size="sm">
                    Registrar candidatura
                  </ButtonLink>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {applications.slice(0, 4).map((application) => {
                const statusInfo = APPLICATION_STATUSES.find((item) => item.id === application.status);
                return (
                  <li key={application.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{application.role}</p>
                      <p className="truncate text-xs text-muted">{application.company}</p>
                    </div>
                    <Badge tone={statusInfo?.tone ?? 'neutral'}>{statusInfo?.label ?? application.status}</Badge>
                  </li>
                );
              })}
            </ul>
          )}

          {applications.length > 4 && (
            <p className="mt-3 text-xs text-muted">
              e mais {applications.length - 4} {pluralize(applications.length - 4, 'candidatura', 'candidaturas')}.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

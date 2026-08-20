import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth/session';
import { getRepository } from '@/lib/db';
import { ACTIVE_STATUSES, APPLICATION_STATUSES } from '@/types/application';
import { Card, CardBody, CardHeader, SectionTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { ApplicationForm } from '@/components/applications/ApplicationForm';
import { ApplicationRow } from '@/components/applications/ApplicationRow';

export const metadata: Metadata = { title: 'Minhas candidaturas' };

/**
 * Acompanhamento de vagas.
 *
 * Um tracker simples e manual, de propósito: integrar com portal de vagas
 * exigiria credencial de terceiro e traria dados que não controlamos. Anotar à
 * mão dá trabalho, mas é o que funciona no dia seguinte sem depender de
 * ninguém.
 */
export default async function ApplicationsPage() {
  const user = await requireUser('/app/candidaturas');
  const repository = await getRepository();
  const applications = await repository.listApplications(user.id);

  const metrics = [
    { label: 'Total de candidaturas', value: applications.length },
    {
      label: 'Processos ativos',
      value: applications.filter((item) => ACTIVE_STATUSES.includes(item.status)).length,
    },
    { label: 'Entrevistas', value: applications.filter((item) => item.status === 'entrevista').length },
    { label: 'Aprovados', value: applications.filter((item) => item.status === 'aprovado').length },
  ];

  const grouped = APPLICATION_STATUSES.map((status) => ({
    status,
    items: applications.filter((application) => application.status === status.id),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <SectionTitle
        title="Minhas candidaturas"
        description="Registre onde você se candidatou para não perder o fio de nenhum processo."
      />

      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-card border border-line bg-surface px-4 py-3.5 shadow-card">
              <dt className="text-xs font-medium text-muted">{metric.label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-ink">{metric.value}</dd>
            </div>
          ))}
        </dl>

        <Card>
          <CardHeader title="Registrar candidatura" />
          <CardBody>
            <ApplicationForm />
          </CardBody>
        </Card>

        {applications.length === 0 ? (
          <EmptyState
            title="Nenhuma candidatura registrada ainda"
            description="Assim que você se candidatar a uma vaga, registre aqui. Em duas semanas você vai agradecer por ter anotado."
          />
        ) : (
          <div className="space-y-6">
            {grouped.map((group) => (
              <section key={group.status.id}>
                <h2 className="mb-3 text-sm font-semibold text-ink">
                  {group.status.label}
                  <span className="ml-2 text-xs font-normal text-muted">({group.items.length})</span>
                </h2>
                <ul className="space-y-3">
                  {group.items.map((application) => (
                    <ApplicationRow key={application.id} application={application} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

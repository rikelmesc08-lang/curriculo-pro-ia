/** Candidatura acompanhada no job tracker. */
export type ApplicationStatus = 'aplicado' | 'em-analise' | 'entrevista' | 'aprovado' | 'reprovado';

export const APPLICATION_STATUSES: { id: ApplicationStatus; label: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }[] = [
  { id: 'aplicado', label: 'Aplicado', tone: 'neutral' },
  { id: 'em-analise', label: 'Em análise', tone: 'info' },
  { id: 'entrevista', label: 'Entrevista', tone: 'warning' },
  { id: 'aprovado', label: 'Aprovado', tone: 'success' },
  { id: 'reprovado', label: 'Reprovado', tone: 'danger' },
];

/** Status que ainda podem virar uma vaga. Usado no card "processos ativos". */
export const ACTIVE_STATUSES: ApplicationStatus[] = ['aplicado', 'em-analise', 'entrevista'];

export interface Application {
  id: string;
  ownerId: string;
  company: string;
  role: string;
  appliedAt: string;
  status: ApplicationStatus;
  link: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type ApplicationInput = Pick<Application, 'company' | 'role' | 'appliedAt' | 'status' | 'link' | 'notes'>;

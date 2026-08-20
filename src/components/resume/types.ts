import type { ResumeContent } from '@/types/resume';

/** Contrato comum de toda etapa do formulário. */
export interface StepProps {
  content: ResumeContent;
  update: (updater: (previous: ResumeContent) => ResumeContent) => void;
  /**
   * Vaga de referência, quando a pessoa colou uma.
   *
   * Serve só para a IA escolher o que destacar — nunca para preencher campo.
   * Vazio é o caso normal e não desabilita nada.
   */
  jobDescription: string;
}

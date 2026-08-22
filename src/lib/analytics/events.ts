/**
 * Catálogo de eventos do produto.
 *
 * O nome do evento é um tipo, não uma string solta: assim um erro de digitação
 * em `pdf_donwload` quebra o build em vez de virar um evento órfão que ninguém
 * percebe faltando no relatório três meses depois.
 *
 * NENHUM SERVIÇO EXTERNO ESTÁ CONECTADO. Ver `track.ts` — sem configuração, os
 * eventos não saem do navegador. Isso é deliberado: mandar dado de quem está
 * montando currículo para um terceiro exige decisão consciente do dono do
 * produto e aviso na política de privacidade, não um script colado no layout.
 */

export type AnalyticsEventName =
  | 'landing_view'
  | 'start_resume'
  | 'resume_created'
  | 'job_analysis_started'
  | 'job_analysis_completed'
  | 'ats_analysis'
  | 'resume_review'
  | 'cover_letter_generated'
  | 'interview_prep'
  | 'pdf_download'
  | 'checkout_started'
  | 'purchase_completed';

/**
 * Propriedades permitidas por evento.
 *
 * REGRA DE PRIVACIDADE: nada aqui pode conter conteúdo do currículo, nome,
 * e-mail, telefone ou texto de vaga. Só contagem, identificador de modelo e
 * modo de IA. Um evento de analytics vaza para fora do nosso controle; o
 * currículo de alguém não pode ir junto.
 */
export interface AnalyticsProperties {
  landing_view: Record<string, never>;
  start_resume: { variante: string };
  resume_created: { variante: string; modelo: string };
  job_analysis_started: Record<string, never>;
  job_analysis_completed: { modo: 'real' | 'demo'; termos: number };
  ats_analysis: { modo: 'real' | 'demo'; pontuacao: number };
  // `acesso` mede quantas análises param na prévia — é o número que diz se o
  // corte entre gratuito e pago está no lugar certo. Nenhum conteúdo junto.
  resume_review: { modo: 'real' | 'demo'; pontuacao: number; acesso: 'completo' | 'previa' };
  cover_letter_generated: { modo: 'real' | 'demo' };
  interview_prep: { modo: 'real' | 'demo'; perguntas: number };
  pdf_download: { modelo: string };
  checkout_started: Record<string, never>;
  purchase_completed: { valor: number };
}

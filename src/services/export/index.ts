import 'server-only';

import { resumeFileName } from '@/lib/resume/sections';
import type { ResumeContent } from '@/types/resume';
import { renderResumePdf } from './pdf';

/**
 * Camada de exportação.
 *
 * A interface abaixo existe para o DOCX previsto no roteiro entrar sem que a
 * tela mude: a página pede um formato, recebe bytes e um nome de arquivo, e
 * não sabe qual biblioteca gerou o quê.
 *
 * O formato `docx` está declarado e NÃO implementado — de propósito, e de
 * forma barulhenta. Um exportador que devolve um arquivo vazio ou um PDF
 * renomeado seria pior do que a ausência: o usuário só descobriria o problema
 * ao anexar o arquivo numa candidatura.
 */

export type ExportFormat = 'pdf' | 'docx';

export interface ExportResult {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
}

export interface Exporter {
  format: ExportFormat;
  label: string;
  available: boolean;
  run(resume: ResumeContent): Promise<ExportResult>;
}

const pdfExporter: Exporter = {
  format: 'pdf',
  label: 'PDF',
  available: true,
  async run(resume) {
    return {
      bytes: await renderResumePdf(resume),
      fileName: resumeFileName(resume),
      contentType: 'application/pdf',
    };
  },
};

const docxExporter: Exporter = {
  format: 'docx',
  label: 'DOCX',
  available: false,
  async run() {
    throw new Error(
      'Exportação para DOCX ainda não implementada. Use o PDF — ele já sai com texto selecionável e legível por ATS.'
    );
  },
};

const EXPORTERS: Record<ExportFormat, Exporter> = {
  pdf: pdfExporter,
  docx: docxExporter,
};

export function getExporter(format: ExportFormat): Exporter {
  return EXPORTERS[format];
}

/** Formatos que a interface pode oferecer hoje. */
export function availableFormats(): Exporter[] {
  return Object.values(EXPORTERS).filter((exporter) => exporter.available);
}

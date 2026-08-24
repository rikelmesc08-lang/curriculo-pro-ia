'use client';

import { useState } from 'react';
import { track } from '@/lib/analytics/track';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import type { ReviewIssue } from '@/types/ai';
import type { ResumeContent } from '@/types/resume';

/**
 * Baixa o currículo ATUAL com os problemas marcados em cima dele.
 *
 * Irmão do `DownloadPdfButton`, e separado dele de propósito: os dois pedem
 * arquivos diferentes, de rotas diferentes, e um deles não pode ser enviado
 * para vaga nenhuma. Um componente só, decidindo por uma flag, acabaria com
 * alguém passando a flag errada.
 */
export function DownloadDiagnosticButton({
  resume,
  issues,
  score,
  potentialScore,
}: {
  resume: ResumeContent;
  issues: ReviewIssue[];
  score: number;
  potentialScore: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/curriculo/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, issues, score, potentialScore }),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { erro?: string } | null;
        setError(detail?.erro ?? 'Não conseguimos gerar o PDF do diagnóstico agora.');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = disposition(response) ?? 'curriculo-diagnostico.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      track('pdf_download', { modelo: 'diagnostico' });
    } catch {
      setError('Falha de conexão ao gerar o PDF. Verifique sua internet e tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        onClick={download}
        loading={pending}
        loadingLabel="Marcando seu currículo..."
        size="lg"
      >
        <Icon name="olho" className="h-4 w-4" />
        Baixar currículo marcado
      </Button>

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  );
}

function disposition(response: Response): string | null {
  const header = response.headers.get('Content-Disposition');
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match ? match[1] : null;
}

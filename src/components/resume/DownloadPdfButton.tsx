'use client';

import { useState } from 'react';
import { track } from '@/lib/analytics/track';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import type { ResumeContent } from '@/types/resume';

/**
 * Botão "Baixar PDF".
 *
 * Faz POST do currículo que está na tela e recebe os bytes. O download é
 * disparado por um `<a download>` criado na hora, e o object URL é revogado
 * em seguida — sem isso, cada clique deixaria o arquivo inteiro preso na
 * memória da aba até ela ser fechada.
 */
export function DownloadPdfButton({
  resume,
  disabled,
  disabledReason,
  block,
}: {
  resume: ResumeContent;
  disabled?: boolean;
  disabledReason?: string;
  block?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/curriculo/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resume),
      });

      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { erro?: string } | null;
        setError(detail?.erro ?? 'Não conseguimos gerar o PDF agora.');
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = disposition(response) ?? 'curriculo.pdf';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      track('pdf_download', { modelo: resume.template });
    } catch {
      setError('Falha de conexão ao gerar o PDF. Verifique sua internet e tente de novo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={block ? 'w-full' : undefined}>
      <Button
        type="button"
        onClick={download}
        loading={pending}
        loadingLabel="Gerando PDF..."
        disabled={disabled}
        block={block}
        size="lg"
      >
        <Icon name="download" className="h-4 w-4" />
        Baixar PDF
      </Button>

      {disabled && disabledReason && (
        <p className="mt-2 text-xs text-muted">{disabledReason}</p>
      )}

      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  );
}

/** Lê o nome do arquivo que o servidor escolheu. */
function disposition(response: Response): string | null {
  const header = response.headers.get('Content-Disposition');
  if (!header) return null;
  const match = /filename="([^"]+)"/.exec(header);
  return match ? match[1] : null;
}

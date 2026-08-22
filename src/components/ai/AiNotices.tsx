'use client';

import { useState } from 'react';
import { INTEGRITY_DISCLAIMER, type AiMode } from '@/types/ai';
import { Badge } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';

/**
 * Os avisos que acompanham toda saída de IA.
 *
 * Ficam num arquivo só para que seja impossível uma tela nova esquecer de
 * exibi-los: quem renderiza resultado de IA importa `AiResult`, e o carimbo
 * vem junto.
 */

/** Diz de onde veio o resultado. Aparece colado ao conteúdo, não no rodapé. */
export function AiModeBadge({ mode }: { mode: AiMode }) {
  if (mode === 'demo') {
    return <Badge tone="warning">Modo demonstração — sem IA real</Badge>;
  }
  return <Badge tone="info">Gerado com IA</Badge>;
}

/**
 * Diz que o resultado veio guardado, não de uma chamada nova.
 *
 * Sem este aviso, clicar de novo e receber exatamente o mesmo texto parece
 * defeito. Com ele, fica claro que a resposta não mudou porque a pergunta não
 * mudou — e que isso poupou uma chamada de IA.
 */
export function CachedBadge() {
  return <Badge tone="neutral">Resultado já calculado — sem nova chamada</Badge>;
}

export function IntegrityNote({ className }: { className?: string }) {
  return (
    <p className={className ?? 'text-xs leading-relaxed text-muted'}>
      <strong className="font-semibold text-ink-soft">Integridade:</strong> {INTEGRITY_DISCLAIMER}
    </p>
  );
}

/** Botão de copiar com confirmação visual. Usado em carta e mensagens. */
export function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A API de área de transferência exige contexto seguro e permissão. Em
      // vez de fingir sucesso, avisamos para a pessoa selecionar o texto.
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="secondary" size="sm" onClick={copy}>
        {copied ? 'Copiado' : label}
      </Button>
      {failed && <span className="text-xs text-danger">Seu navegador bloqueou a cópia. Selecione o texto manualmente.</span>}
    </div>
  );
}

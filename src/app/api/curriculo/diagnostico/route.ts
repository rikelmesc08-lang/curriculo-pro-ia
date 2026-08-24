import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { parseResumeContent } from '@/lib/resume/schema';
import { resumeFileName } from '@/lib/resume/sections';
import { renderDiagnosticPdf } from '@/services/export/diagnostic-pdf';

/**
 * PDF do currículo ATUAL com os problemas marcados em cima dele.
 *
 * É uma rota separada de `/api/curriculo/pdf` de propósito: aquela entrega o
 * currículo da pessoa, para ela mandar para vagas. Esta entrega um documento de
 * trabalho, tarjado, que NÃO deve ser enviado a ninguém. Compartilhar a rota
 * significaria decidir entre os dois por um campo do corpo — e um dia alguém
 * passaria o campo errado e a pessoa anexaria o diagnóstico numa candidatura.
 *
 * Os problemas vêm do cliente porque é lá que a análise está, na tela, e
 * refazê-la aqui custaria outra chamada de IA para gerar o mesmo documento. Não
 * há risco de escalonamento nisso: o conteúdo é do próprio usuário, é validado
 * na entrada, e volta para ele mesmo, num arquivo.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Mesmo teto de `/api/curriculo/pdf`, mais folga para a lista de problemas. */
const MAX_CORPO_BYTES = 768 * 1024;

const corpoSchema = z.object({
  resume: z.unknown(),
  score: z.number().min(0).max(100).catch(0),
  potentialScore: z.number().min(0).max(100).catch(0),
  issues: z
    .array(
      z.object({
        where: z.string().max(400).default(''),
        problem: z.string().max(2000).default(''),
        fix: z.string().max(2000).default(''),
        severity: z.enum(['alta', 'media', 'baixa']).catch('media'),
        anchor: z
          .object({ section: z.string().max(80), entryId: z.string().max(120).optional() })
          .optional()
          .catch(undefined),
      })
    )
    .max(40)
    .default([]),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ erro: 'Sessão expirada. Entre de novo para baixar o PDF.' }, { status: 401 });
  }

  const tamanhoDeclarado = Number(request.headers.get('content-length') ?? '0');
  if (tamanhoDeclarado > MAX_CORPO_BYTES) {
    return NextResponse.json({ erro: 'Diagnóstico grande demais para gerar o PDF.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    const texto = await request.text();
    if (texto.length > MAX_CORPO_BYTES) {
      return NextResponse.json({ erro: 'Diagnóstico grande demais para gerar o PDF.' }, { status: 413 });
    }
    payload = JSON.parse(texto);
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  const corpo = corpoSchema.safeParse(payload);
  if (!corpo.success) {
    return NextResponse.json({ erro: 'Dados do diagnóstico incompletos.' }, { status: 422 });
  }

  let resume;
  try {
    resume = parseResumeContent(corpo.data.resume);
  } catch {
    return NextResponse.json(
      { erro: 'Não conseguimos ler os dados do currículo. Recarregue a página e tente de novo.' },
      { status: 422 }
    );
  }

  try {
    const bytes = await renderDiagnosticPdf({
      resume,
      issues: corpo.data.issues,
      score: corpo.data.score,
      potentialScore: corpo.data.potentialScore,
    });

    // Nome diferente do currículo, e dizendo o que é: o arquivo vai parar na
    // pasta de downloads junto com o currículo de verdade, e é ali que a
    // confusão entre os dois começa.
    const fileName = resumeFileName(resume).replace(/\.pdf$/i, '') + '-diagnostico.pdf';

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, private',
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error('[pdf-diagnostico]', error);
    return NextResponse.json(
      { erro: 'Não conseguimos gerar o PDF agora. Tente de novo em instantes.' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { parseResumeContent } from '@/lib/resume/schema';
import { getExporter } from '@/services/export';

/**
 * Geração do PDF.
 *
 * É POST, e não GET com id na URL, por dois motivos:
 *   1. a pessoa baixa o rascunho que está na tela, inclusive alterações ainda
 *      não salvas — é o que ela conferiu na pré-visualização;
 *   2. um GET com o currículo na query deixaria dado pessoal em histórico de
 *      navegador, log de servidor e Referer.
 *
 * Exige sessão. Sem isso a rota viraria um gerador de PDF aberto na internet.
 */

// O gerador usa APIs de Node (stream, buffer); o runtime precisa ser explícito.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ erro: 'Sessão expirada. Entre de novo para baixar o PDF.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Requisição inválida.' }, { status: 400 });
  }

  let resume;
  try {
    resume = parseResumeContent(payload);
  } catch {
    return NextResponse.json(
      { erro: 'Não conseguimos ler os dados do currículo. Recarregue a página e tente de novo.' },
      { status: 422 }
    );
  }

  try {
    const { bytes, fileName, contentType } = await getExporter('pdf').run(resume);

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        // O arquivo é pessoal e montado sob demanda: nenhum intermediário deve
        // guardar cópia.
        'Cache-Control': 'no-store, private',
        'Content-Length': String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error('[pdf]', error);
    return NextResponse.json(
      { erro: 'Não conseguimos gerar o PDF agora. Tente de novo em instantes.' },
      { status: 500 }
    );
  }
}

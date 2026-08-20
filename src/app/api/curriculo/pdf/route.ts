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

// Montar o PDF de um currículo longo passa do teto padrão de algumas
// plataformas. Mesmo motivo das páginas de IA: falha só em produção.
export const maxDuration = 60;

/**
 * Teto do corpo da requisição.
 *
 * Um currículo válido, com todos os campos no máximo que o schema permite,
 * não passa de algumas dezenas de KB. 512 KB é folga larga.
 *
 * O TETO PRECISA SER CHECADO ANTES DE LER O CORPO: `request.json()` carrega
 * tudo em memória e só então o schema recusaria o excesso. Um cliente
 * autenticado mandando um JSON de centenas de MB derrubaria a função por
 * memória antes de qualquer validação rodar — negação de serviço barata,
 * exigindo só uma conta.
 */
const MAX_CORPO_BYTES = 512 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ erro: 'Sessão expirada. Entre de novo para baixar o PDF.' }, { status: 401 });
  }

  const tamanhoDeclarado = Number(request.headers.get('content-length') ?? '0');
  if (tamanhoDeclarado > MAX_CORPO_BYTES) {
    return NextResponse.json(
      { erro: 'Currículo grande demais para gerar o PDF.' },
      { status: 413 }
    );
  }

  let payload: unknown;
  try {
    // `content-length` pode faltar (envio em pedaços) ou mentir. Ler o texto
    // e medir é a checagem que vale de verdade; a de cima só evita gastar
    // banda com o que já se sabe grande demais.
    const texto = await request.text();
    if (texto.length > MAX_CORPO_BYTES) {
      return NextResponse.json(
        { erro: 'Currículo grande demais para gerar o PDF.' },
        { status: 413 }
      );
    }
    payload = JSON.parse(texto);
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

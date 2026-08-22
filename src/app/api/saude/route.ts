import { NextResponse } from 'next/server';

/**
 * Sonda de vida, para a plataforma saber se o processo responde.
 *
 * O QUE ELA NÃO FAZ, e por que isso é decisão e não preguiça:
 *
 *   1. NÃO CHECA BANCO NEM IA. Uma sonda que depende de serviço externo faz a
 *      plataforma reiniciar o contêiner toda vez que o Supabase ou o Google
 *      piscam — trocando uma instabilidade de fora por uma queda aqui dentro.
 *      Isto responde "o processo está vivo", que é a pergunta que a plataforma
 *      usa para decidir reiniciar.
 *
 *   2. NÃO DEVOLVE VERSÃO, COMMIT, AMBIENTE NEM NOME DE DEPENDÊNCIA. É um
 *      endpoint sem autenticação: tudo que ele contar, conta para qualquer
 *      pessoa na internet. Versão de framework é a primeira coisa que se procura
 *      para escolher qual CVE tentar.
 */

// Sem cache em nenhuma camada: uma sonda respondida por cache diria que o
// processo está vivo depois de ele ter morrido.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * Gerado a cada requisição, não no build.
 *
 * O padrão do Next é gerar este arquivo uma vez, no build, gravando o valor que
 * SITE_URL tinha naquele instante. Quem define SITE_URL só como variável de
 * execução — comum em plataforma de hospedagem — publicaria um arquivo apontando
 * para http://localhost:3000, e nada no build acusaria: ele passa, o deploy sai,
 * e o erro só aparece semanas depois em relatório de indexação.
 *
 * O custo de decidir na requisição é irrelevante aqui: robô de busca lê estes
 * dois arquivos algumas vezes por dia.
 */
export const dynamic = 'force-dynamic';

/**
 * robots.txt.
 *
 * O QUE NÃO ESTÁ AQUI IMPORTA MAIS QUE O QUE ESTÁ. `/login`, `/cadastro`,
 * `/esqueci-senha` e `/nova-senha` NÃO são bloqueados, e isso é deliberado:
 * essas páginas já declaram `robots: { index: false }` nos próprios metadados, e
 * o buscador só enxerga essa instrução se puder abrir a página. Bloquear no
 * robots.txt impediria a leitura da meta tag — e o Google ainda poderia listar a
 * URL, sem conteúdo, se encontrasse um link para ela em algum lugar. O efeito
 * seria o oposto do pretendido.
 *
 * O que é bloqueado é o que não tem meta tag nenhuma para honrar: rota de API,
 * retorno de autenticação e o painel (que redireciona para o login).
 */
export default function robots(): MetadataRoute.Robots {
  const base = env.siteUrl();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/app/'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

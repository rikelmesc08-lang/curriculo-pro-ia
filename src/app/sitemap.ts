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
 * sitemap.xml.
 *
 * SÓ AS PÁGINAS QUE DEVEM SER INDEXADAS. Login, cadastro e recuperação de senha
 * ficam de fora: são telas transacionais, declaram `index: false` nos próprios
 * metadados, e listá-las aqui seria pedir ao buscador exatamente o contrário do
 * que a página diz.
 *
 * NÃO HÁ `lastModified`, e a ausência é escolha. O campo só ajuda quando reflete
 * mudança real de conteúdo; preenchê-lo com a data de agora a cada requisição
 * afirmaria que as três páginas mudam o tempo todo. Sitemap que mente sobre
 * frescor é ignorado — melhor não dizer nada do que dizer errado.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.siteUrl();

  return [
    {
      url: base,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/privacidade`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${base}/termos`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}

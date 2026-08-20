import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Toda URL que o app entrega ao Supabase como destino de link de e-mail precisa
 * ter uma rota que a atenda.
 *
 * O modo de falha é lento e silencioso: o cadastro responde "conta criada", o
 * e-mail chega bonito, a pessoa clica — e cai em lugar nenhum. Nada falha no
 * build, nada aparece no log do servidor, e o teste manual de quem desenvolve
 * passa, porque em `localhost:3000` a URL até funciona. O erro só existe em
 * produção, e a primeira notícia dele é um usuário reclamando que não consegue
 * entrar.
 *
 * Foi exatamente o que aconteceu com a confirmação de e-mail: `signUp` não
 * passava `emailRedirectTo`, o Supabase caiu no "Site URL" do painel dele
 * (`http://localhost:3000`), e ninguém conseguia concluir o cadastro.
 *
 * Este teste lê o código-fonte em vez de executar a ação porque o alvo é uma
 * relação ENTRE ARQUIVOS — a URL escrita aqui e a rota que existe ali. Executar
 * a ação exigiria contexto de requisição do Next e um Supabase de mentira, e
 * ainda assim não notaria a rota faltando.
 */
describe('destinos de e-mail apontam para rotas que existem', () => {
  const acoes = readFileSync(join(process.cwd(), 'src/lib/auth/actions.ts'), 'utf8');

  // Captura `${env.siteUrl()}/auth/confirmar` e afins.
  const encontrados = [...acoes.matchAll(/\$\{env\.siteUrl\(\)\}(\/[a-z0-9/-]+)/g)].map(
    (m) => m[1]
  );

  it('há destinos declarados no código (o teste não passa por vacuidade)', () => {
    assert.ok(
      encontrados.length >= 2,
      `esperava ao menos os destinos de cadastro e recuperação, achei ${encontrados.length}`
    );
  });

  // Vale route.ts OU page.tsx: `/auth/confirmar` precisa de handler porque
  // escreve cookie, mas `/nova-senha` é tela e se resolve com página. O que o
  // teste exige é que a URL seja ATENDIDA por alguma coisa — não que seja
  // atendida de uma forma específica.
  const ATENDIDA_POR = ['route.ts', 'page.tsx'];

  for (const caminho of [...new Set(encontrados)]) {
    it(`${caminho} é atendido por alguma rota`, () => {
      const pasta = join(process.cwd(), 'src/app', caminho.slice(1));
      // Segmentos entre parênteses, como (auth), não aparecem na URL; por isso
      // a busca também tenta os grupos existentes.
      const candidatos = ATENDIDA_POR.flatMap((arquivo) => [
        join(pasta, arquivo),
        join(process.cwd(), 'src/app/(auth)', caminho.slice(1), arquivo),
      ]);

      assert.ok(
        candidatos.some(existsSync),
        `o codigo manda o usuario para ${caminho}, mas nenhum destes existe: ` +
          candidatos.join(", ")
      );
    });
  }

  it('o cadastro diz ao Supabase para onde voltar', () => {
    assert.match(
      acoes,
      /emailRedirectTo:\s*`\$\{env\.siteUrl\(\)\}\/auth\/confirmar`/,
      'sem emailRedirectTo o Supabase usa o "Site URL" do painel, que nasce como localhost'
    );
  });

  it('a recuperação de senha diz ao Supabase para onde voltar', () => {
    assert.match(acoes, /redirectTo:\s*`\$\{env\.siteUrl\(\)\}\/auth\/recuperar`/);
  });
});

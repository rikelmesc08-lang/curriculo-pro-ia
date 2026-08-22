import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { REGRAS } from './throttle';

const ler = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Nenhum estado de autenticação pode ser um beco sem saída.
 *
 * Beco sem saída aqui é um estado em que a pessoa não consegue entrar e nada
 * que ela tente muda isso. O caso que originou estes testes foi encontrado no
 * site publicado e é exemplar: e-mail não confirmado devolvia "E-mail ou senha
 * incorretos". A pessoa tem a senha certa, ouve que está errada, vai redefinir
 * a senha — e continua fora, porque a senha nunca foi o problema. Não existia
 * nenhuma sequência de cliques que resolvesse.
 *
 * O que torna esse defeito perigoso é que ele não aparece em erro nenhum: o
 * servidor responde 200, o formulário funciona, e só a pessoa do outro lado
 * sabe que está presa.
 *
 * Os testes leem o código-fonte porque o alvo é uma relação entre arquivos —
 * a causa detectada na ação e a saída oferecida na tela. Executar a ação
 * exigiria contexto de requisição do Next e um Supabase de mentira, e ainda
 * assim não notaria a falta do link.
 */
describe('saídas de autenticação', () => {
  const acoes = ler('src/lib/auth/actions.ts');
  const formLogin = ler('src/app/(auth)/_components/AuthForm.tsx');
  const formSenha = ler('src/app/(auth)/_components/PasswordResetForms.tsx');
  const rotaConfirmar = ler('src/app/auth/confirmar/route.ts');

  describe('e-mail não confirmado', () => {
    it('o login distingue essa causa em vez de culpar a senha', () => {
      assert.match(
        acoes,
        /error\?\.code === 'email_not_confirmed'/,
        'sem esta checagem a pessoa é mandada a duvidar de uma senha que está certa'
      );
    });

    it('a causa chega à tela com um código próprio', () => {
      assert.match(acoes, /'email-nao-confirmado'/);
    });

    it('a tela de login oferece o reenvio junto do erro', () => {
      assert.match(formLogin, /email-nao-confirmado/);
      assert.match(
        formLogin,
        /href="\/confirmar-email"/,
        'a mensagem certa sem caminho de saída continua sendo um beco'
      );
    });

    it('a tela de reenvio existe', () => {
      assert.ok(
        existsSync(join(process.cwd(), 'src/app/(auth)/confirmar-email/page.tsx')),
        'o login aponta para /confirmar-email; a página precisa existir'
      );
    });

    it('existe ação de reenvio', () => {
      assert.match(acoes, /export async function resendConfirmationAction/);
      assert.match(acoes, /type: 'signup'/);
    });
  });

  describe('link de confirmação que não serve', () => {
    it('leva à tela de reenvio, e não ao login', () => {
      assert.match(
        rotaConfirmar,
        /\/confirmar-email\?erro=/,
        'no login essa pessoa só encontraria um botão que não pode funcionar'
      );
      assert.doesNotMatch(rotaConfirmar, /'\/login\?erro=confirmacao'/);
    });

    it('separa expirado do resto, que não é distinguível', () => {
      assert.match(rotaConfirmar, /otp_expired/);
      assert.match(rotaConfirmar, /link-expirado/);
    });
  });

  describe('link de recuperação que não serve', () => {
    it('a ação marca a causa', () => {
      assert.match(acoes, /'link-de-recuperacao-invalido'/);
    });

    it('a tela de senha nova oferece pedir outro link', () => {
      assert.match(formSenha, /link-de-recuperacao-invalido/);
      assert.match(
        formSenha,
        /href="\/esqueci-senha"/,
        '"peça um novo link" sem link para pedir não é saída'
      );
    });
  });

  describe('as duas telas que disparam e-mail são limitadas', () => {
    // Elas fazem um servidor de e-mail mandar mensagem para um endereço que
    // ninguém precisa provar que é seu. Sem limite viram ferramenta de
    // inundação, com este produto no campo do remetente.
    for (const regra of ['recuperacaoPorEmail', 'recuperacaoPorIp', 'confirmacaoPorEmail', 'confirmacaoPorIp'] as const) {
      it(`${regra} tem limite definido`, () => {
        assert.ok(REGRAS[regra], `${regra} não existe em REGRAS`);
        assert.ok(REGRAS[regra].limite > 0 && REGRAS[regra].limite <= 10);
        assert.ok(REGRAS[regra].janelaMs > 0);
      });
    }

    it('o reenvio verifica os dois eixos antes de mandar e-mail', () => {
      const corpo = acoes.slice(acoes.indexOf('resendConfirmationAction'));
      const ate = corpo.slice(0, corpo.indexOf('auth.resend'));
      assert.match(ate, /verificarLimite\('confirmacaoPorIp'\)/);
      assert.match(ate, /verificarLimite\('confirmacaoPorEmail'/);
    });

    it('o reenvio responde igual para conta existente e inexistente', () => {
      const corpo = acoes.slice(acoes.indexOf('resendConfirmationAction'), acoes.indexOf('signOutAction'));
      // Uma única frase de confirmação, reutilizada em todos os caminhos.
      const ocorrencias = corpo.match(/return formSuccess\(confirmacao\)/g) ?? [];
      assert.ok(
        ocorrencias.length >= 2,
        'caminhos diferentes com respostas diferentes transformam a tela num verificador de cadastro'
      );
    });
  });
});

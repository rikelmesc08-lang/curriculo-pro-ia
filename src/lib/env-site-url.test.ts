import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { env } from './env';

/**
 * `siteUrl()` é a base de todo link que sai deste produto: confirmação de
 * cadastro, recuperação de senha, URL canônica, prévia de link.
 *
 * O caso de produção é o que estes testes existem para proteger. Se um deploy
 * de produção resolvesse o próprio endereço a partir da plataforma, os e-mails
 * de clientes reais passariam a apontar para um domínio gerado
 * automaticamente — e o defeito não apareceria em erro nenhum, só na taxa de
 * gente que não consegue confirmar a conta.
 *
 * O caso de preview foi encontrado testando: `SITE_URL` é um valor só e
 * carrega o domínio de produção, então os links do preview levavam para a
 * produção, que roda outro código. Nenhum fluxo de e-mail era verificável
 * antes do merge.
 */

const ORIGINAIS = { ...process.env };

beforeEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  process.env.SITE_URL = 'https://curriculopro.com.br';
});

afterEach(() => {
  process.env = { ...ORIGINAIS };
});

describe('siteUrl', () => {
  describe('produção nunca resolve o próprio endereço', () => {
    it('ignora o domínio da plataforma e usa SITE_URL', () => {
      process.env.VERCEL_ENV = 'production';
      process.env.VERCEL_URL = 'curriculo-pro-abc123.vercel.app';
      process.env.VERCEL_BRANCH_URL = 'curriculo-pro-ia-git-main.vercel.app';

      assert.equal(
        env.siteUrl(),
        'https://curriculopro.com.br',
        'e-mail de cliente real não pode apontar para um domínio gerado pela plataforma'
      );
    });
  });

  describe('preview aponta para si mesmo', () => {
    it('prefere o domínio da branch, que é estável entre deploys', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_BRANCH_URL = 'curriculo-pro-ia-git-uma-branch.vercel.app';
      process.env.VERCEL_URL = 'curriculo-pro-abc123.vercel.app';

      assert.equal(env.siteUrl(), 'https://curriculo-pro-ia-git-uma-branch.vercel.app');
    });

    it('cai no domínio do deploy quando o da branch não vem', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_URL = 'curriculo-pro-abc123.vercel.app';

      assert.equal(env.siteUrl(), 'https://curriculo-pro-abc123.vercel.app');
    });

    it('volta para SITE_URL quando a plataforma não expõe domínio nenhum', () => {
      process.env.VERCEL_ENV = 'preview';

      assert.equal(env.siteUrl(), 'https://curriculopro.com.br');
    });

    it('recusa host malformado em vez de montar uma URL torta', () => {
      // O valor vem da plataforma, não de um cliente — mas termina dentro de
      // `new URL()` e de link de e-mail, e um host com barra ou arroba mudaria
      // o destino do endereço montado.
      for (const host of ['evil.com/caminho', 'usuario@evil.com', 'com espaco', '-comeca-com-hifen']) {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_BRANCH_URL = host;

        assert.equal(
          env.siteUrl(),
          'https://curriculopro.com.br',
          `host inválido ${JSON.stringify(host)} deveria ser descartado`
        );
      }
    });
  });

  describe('fora da Vercel nada muda', () => {
    it('sem VERCEL_ENV, usa SITE_URL', () => {
      assert.equal(env.siteUrl(), 'https://curriculopro.com.br');
    });

    it('sem SITE_URL, cai no localhost de desenvolvimento', () => {
      delete process.env.SITE_URL;
      assert.equal(env.siteUrl(), 'http://localhost:3000');
    });

    it('hasSiteUrl continua falando só de SITE_URL', () => {
      // O aviso de produção existe para cobrar SITE_URL de quem esqueceu; se o
      // domínio de preview o silenciasse, o esquecimento passaria batido.
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_BRANCH_URL = 'curriculo-pro-ia-git-uma-branch.vercel.app';
      delete process.env.SITE_URL;

      assert.equal(env.hasSiteUrl(), false);
    });
  });
});

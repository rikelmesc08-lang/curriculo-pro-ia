import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { normalizeEmail } from './validation';
import {
  REGRAS,
  limparLimite,
  mensagemDeLimite,
  verificarLimiteDe,
  zerarContadores,
} from './throttle';

/**
 * Limite de tentativas — força bruta e credential stuffing.
 *
 * Os testes atacam `verificarLimiteDe`, que recebe o alvo já resolvido. A
 * resolução do IP mora em `verificarLimite`, que depende de `next/headers` e só
 * existe dentro de uma requisição; a REGRA, que é onde um erro custa uma conta
 * invadida, é toda exercitada aqui.
 */

/** Mesma normalização que a ação usa antes de chamar o limitador. */
function porEmail(email: string) {
  return verificarLimiteDe('loginPorEmail', normalizeEmail(email));
}

beforeEach(() => {
  zerarContadores();
});

describe('limite por conta', () => {
  it('deixa passar até o limite e bloqueia depois', () => {
    for (let i = 0; i < REGRAS.loginPorEmail.limite; i++) {
      assert.equal(porEmail('alvo@exemplo.test').permitido, true, `bloqueou cedo demais em ${i + 1}`);
    }

    const excedente = porEmail('alvo@exemplo.test');
    assert.equal(excedente.permitido, false);
    assert.ok(excedente.esperarSegundos > 0);
  });

  it('conta contas diferentes separadamente', () => {
    for (let i = 0; i < REGRAS.loginPorEmail.limite; i++) porEmail('primeira@exemplo.test');

    // Bloquear uma conta não pode bloquear as outras: seria negação de serviço
    // contra todo mundo a partir de uma conta só.
    assert.equal(porEmail('segunda@exemplo.test').permitido, true);
  });

  it('trata o mesmo e-mail escrito diferente como um só', () => {
    for (let i = 0; i < REGRAS.loginPorEmail.limite; i++) porEmail('alvo@exemplo.test');

    // Sem normalizar, variar a caixa daria ao atacante um limite novo a cada
    // grafia da mesma conta.
    assert.equal(porEmail('  ALVO@Exemplo.TEST  ').permitido, false, 'a caixa contornou o limite');
  });

  it('zera depois de um login bem-sucedido', () => {
    for (let i = 0; i < REGRAS.loginPorEmail.limite; i++) porEmail('alvo@exemplo.test');
    assert.equal(porEmail('alvo@exemplo.test').permitido, false);

    limparLimite('loginPorEmail', 'alvo@exemplo.test');

    // Sem isto, quem erra a senha algumas vezes e depois acerta ficaria trancado
    // ao voltar minutos mais tarde — punido por um ataque que não houve.
    assert.equal(porEmail('alvo@exemplo.test').permitido, true);
  });
});

describe('limite por endereço', () => {
  it('bloqueia varredura de muitas contas do mesmo IP', () => {
    for (let i = 0; i < REGRAS.loginPorIp.limite; i++) {
      assert.equal(verificarLimiteDe('loginPorIp', '203.0.113.10').permitido, true);
    }
    assert.equal(verificarLimiteDe('loginPorIp', '203.0.113.10').permitido, false);
  });

  it('não contamina outros endereços', () => {
    for (let i = 0; i < REGRAS.loginPorIp.limite; i++) verificarLimiteDe('loginPorIp', '203.0.113.10');
    assert.equal(verificarLimiteDe('loginPorIp', '198.51.100.7').permitido, true);
  });

  it('cada operação tem contador próprio', () => {
    for (let i = 0; i < REGRAS.cadastroPorIp.limite; i++) {
      verificarLimiteDe('cadastroPorIp', '203.0.113.10');
    }
    assert.equal(verificarLimiteDe('cadastroPorIp', '203.0.113.10').permitido, false);

    // Esgotar o cadastro não pode fechar a recuperação de senha: quem já tem
    // conta continua precisando de um caminho para voltar.
    assert.equal(verificarLimiteDe('recuperacaoPorIp', '203.0.113.10').permitido, true);
    assert.equal(verificarLimiteDe('loginPorIp', '203.0.113.10').permitido, true);
  });

  it('alvo vazio não é contado nem bloqueado', () => {
    // Cabeçalho ausente não pode virar uma chave compartilhada por todo mundo,
    // que bloquearia usuários legítimos uns aos outros.
    for (let i = 0; i < REGRAS.loginPorIp.limite + 5; i++) {
      assert.equal(verificarLimiteDe('loginPorIp', '').permitido, true);
    }
  });
});

describe('recuperação de senha', () => {
  it('é mais restrita que o login, porque dispara e-mail', () => {
    assert.ok(
      REGRAS.recuperacaoPorEmail.limite <= REGRAS.loginPorEmail.limite,
      'pedir link de recuperação está tão solto quanto tentar senha'
    );
  });

  it('bloqueia o bombardeio da caixa de entrada de uma pessoa', () => {
    for (let i = 0; i < REGRAS.recuperacaoPorEmail.limite; i++) {
      verificarLimiteDe('recuperacaoPorEmail', 'vitima@exemplo.test');
    }
    assert.equal(verificarLimiteDe('recuperacaoPorEmail', 'vitima@exemplo.test').permitido, false);
  });
});

describe('mensagem de bloqueio', () => {
  it('não revela se a conta existe', () => {
    const texto = mensagemDeLimite(600);
    assert.ok(!/e-mail|conta|usuário|cadastr|senha/i.test(texto), `vaza contexto: ${texto}`);
    assert.match(texto, /tentativas/i);
  });

  it('arredonda a espera para cima, nunca para zero', () => {
    assert.match(mensagemDeLimite(1), /um minuto/);
    assert.match(mensagemDeLimite(600), /10 minutos/);
  });
});

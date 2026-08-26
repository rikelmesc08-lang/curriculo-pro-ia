import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { verificarAssinatura } from './mercadopago-signature';

/**
 * O QUE ESTES TESTES PROTEGEM: a fronteira entre dinheiro de quem pagou e
 * dinheiro de quem finge ter pagado.
 *
 * A URL do webhook não é segredo — aparece no painel do provedor e em log de
 * borda. A assinatura é a única coisa entre ela e alguém declarando "aprovado".
 * Por isso o teste que importa aqui não é o do caminho feliz: é a lista de
 * coisas que PRECISAM ser recusadas.
 */

const SEGREDO = 'segredo-de-teste-abc123';
const AGORA = 1_700_000_000;

function assinar(
  dataId: string,
  requestId: string | null,
  ts: number,
  segredo = SEGREDO
): string {
  const manifesto =
    `id:${dataId.toLowerCase()};` + (requestId ? `request-id:${requestId};` : '') + `ts:${ts};`;
  const v1 = createHmac('sha256', segredo).update(manifesto).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verificarAssinatura — o que passa', () => {
  it('aceita uma notificação legítima', () => {
    const resultado = verificarAssinatura(
      {
        signature: assinar('123456', 'req-1', AGORA),
        requestId: 'req-1',
        dataId: '123456',
      },
      SEGREDO,
      AGORA
    );

    assert.deepEqual(resultado, { valida: true });
  });

  it('aceita sem x-request-id, que nem sempre vem', () => {
    const resultado = verificarAssinatura(
      { signature: assinar('123456', null, AGORA), requestId: null, dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, true);
  });

  it('normaliza id alfanumérico para minúsculas, como o provedor faz', () => {
    const resultado = verificarAssinatura(
      { signature: assinar('ABC-XYZ', 'req-1', AGORA), requestId: 'req-1', dataId: 'ABC-XYZ' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, true);
  });

  it('não depende da ordem dos campos no cabeçalho', () => {
    const assinatura = assinar('123456', 'req-1', AGORA);
    const v1 = /v1=([a-f0-9]+)/.exec(assinatura)![1];

    const resultado = verificarAssinatura(
      { signature: `v1=${v1}, ts=${AGORA}`, requestId: 'req-1', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, true);
  });

  it('aceita dentro da janela de tolerância', () => {
    const resultado = verificarAssinatura(
      { signature: assinar('123456', 'req-1', AGORA - 600), requestId: 'req-1', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, true);
  });
});

describe('verificarAssinatura — o que precisa ser recusado', () => {
  it('recusa assinatura feita com outro segredo', () => {
    const resultado = verificarAssinatura(
      {
        signature: assinar('123456', 'req-1', AGORA, 'segredo-do-atacante'),
        requestId: 'req-1',
        dataId: '123456',
      },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
  });

  it('recusa quando o data.id foi trocado depois de assinar', () => {
    // O ataque óbvio: pegar uma notificação legítima e apontá-la para outro
    // pagamento. O id entra no manifesto justamente para impedir isso.
    const resultado = verificarAssinatura(
      { signature: assinar('123456', 'req-1', AGORA), requestId: 'req-1', dataId: '999999' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
  });

  it('recusa quando o request-id foi trocado', () => {
    const resultado = verificarAssinatura(
      { signature: assinar('123456', 'req-1', AGORA), requestId: 'req-outro', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
  });

  it('recusa notificação velha, para reenvio capturado não valer para sempre', () => {
    const resultado = verificarAssinatura(
      { signature: assinar('123456', 'req-1', AGORA - 3600), requestId: 'req-1', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
    assert.match((resultado as { motivo: string }).motivo, /janela/);
  });

  it('recusa ts no futuro, que é relógio errado ou validade esticada', () => {
    const resultado = verificarAssinatura(
      { signature: assinar('123456', 'req-1', AGORA + 3600), requestId: 'req-1', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
  });

  it('recusa sem cabeçalho de assinatura', () => {
    const resultado = verificarAssinatura(
      { signature: null, requestId: 'req-1', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
  });

  it('recusa cabeçalho malformado', () => {
    for (const signature of ['', 'lixo', 'ts=123', 'v1=abc', 'ts=,v1=']) {
      const resultado = verificarAssinatura(
        { signature, requestId: 'req-1', dataId: '123456' },
        SEGREDO,
        AGORA
      );
      assert.equal(resultado.valida, false, `deveria recusar: ${JSON.stringify(signature)}`);
    }
  });

  it('recusa ts que não é número', () => {
    const resultado = verificarAssinatura(
      { signature: 'ts=ontem,v1=abc123', requestId: 'req-1', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
  });

  it('recusa quando o segredo não está configurado', () => {
    // Sem segredo não há verificação possível. O desfecho precisa ser recusa,
    // e nunca "deixa passar porque não dá para conferir".
    const resultado = verificarAssinatura(
      { signature: assinar('123456', 'req-1', AGORA), requestId: 'req-1', dataId: '123456' },
      '',
      AGORA
    );

    assert.equal(resultado.valida, false);
  });

  it('recusa v1 de tamanho errado sem estourar', () => {
    const resultado = verificarAssinatura(
      { signature: `ts=${AGORA},v1=abc`, requestId: 'req-1', dataId: '123456' },
      SEGREDO,
      AGORA
    );

    assert.equal(resultado.valida, false);
  });
});

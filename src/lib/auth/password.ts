import 'server-only';

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Hash de senha do driver local.
 *
 * `scrypt` vem do próprio Node — sem dependência nativa, sem etapa de
 * compilação — e é uma KDF de custo de memória, feita para senha. A OWASP a
 * lista como alternativa aceitável ao Argon2id quando este não está disponível.
 * Guardar SHA-256 puro seria um convite a rainbow table.
 *
 * No driver Supabase isto NÃO é usado: quem guarda senha lá é o Supabase Auth,
 * e recriar armazenamento de senha ao lado de um provedor que já faz isso só
 * aumentaria a superfície de erro.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Parâmetros de custo.
 *
 * `N: 65536` (2^16), `r: 8`, `p: 2` é uma das configurações que a OWASP lista
 * como adequadas para scrypt. O PADRÃO DO NODE é `N: 16384` (2^14) e `p: 1`,
 * quatro vezes mais barato de atacar — e era o que este arquivo usava, por
 * omissão, sem que ninguém tivesse decidido isso.
 *
 * `maxmem` precisa ser passado: o scrypt consome cerca de `128 * N * r` bytes
 * (64 MB nesta configuração) e o teto padrão do Node é 32 MB, de modo que só
 * elevar o `N` faria toda derivação falhar com erro de memória.
 */
const PARAMETROS_ATUAIS = { N: 65536, r: 8, p: 2, maxmem: 160 * 1024 * 1024 } as const;

/**
 * Parâmetros dos hashes gravados ANTES de o formato registrar parâmetros.
 *
 * São os padrões do Node, que era o que a versão anterior usava implicitamente.
 * Sem esta constante, subir o custo invalidaria toda senha já cadastrada — o
 * usuário não conseguiria mais entrar, e nada no sistema explicaria por quê.
 */
const PARAMETROS_LEGADOS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

/**
 * Formato gravado: `scrypt$N$r$p$sal$hash`, tudo em hexadecimal.
 *
 * OS PARÂMETROS FAZEM PARTE DO REGISTRO, e essa é a diferença que permite
 * endurecer o custo depois sem quebrar ninguém: cada hash carrega o custo com
 * que foi gerado. O formato antigo, `scrypt$sal$hash`, continua sendo lido.
 *
 * O sal é por usuário, então duas pessoas com a mesma senha têm hashes
 * diferentes.
 */
export async function hashPassword(password: string): Promise<string> {
  const { N, r, p } = PARAMETROS_ATUAIS;
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMETROS_ATUAIS);
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

interface HashLido {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  esperado: Buffer;
  /** Verdadeiro quando o registro veio no formato antigo, sem parâmetros. */
  legado: boolean;
}

function lerHash(stored: string): HashLido | null {
  const partes = stored.split('$');
  if (partes[0] !== 'scrypt') return null;

  // Formato antigo: scrypt$sal$hash
  if (partes.length === 3) {
    return {
      ...PARAMETROS_LEGADOS,
      salt: Buffer.from(partes[1], 'hex'),
      esperado: Buffer.from(partes[2], 'hex'),
      legado: true,
    };
  }

  // Formato atual: scrypt$N$r$p$sal$hash
  if (partes.length === 6) {
    const N = Number.parseInt(partes[1], 10);
    const r = Number.parseInt(partes[2], 10);
    const p = Number.parseInt(partes[3], 10);
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return null;
    // Teto de sanidade: um registro adulterado com N gigantesco viraria negação
    // de serviço por consumo de memória a cada tentativa de login.
    if (N > PARAMETROS_ATUAIS.N || r > 32 || p > 16) return null;
    return {
      N,
      r,
      p,
      salt: Buffer.from(partes[4], 'hex'),
      esperado: Buffer.from(partes[5], 'hex'),
      legado: false,
    };
  }

  return null;
}

/**
 * Confere a senha em tempo constante.
 *
 * `timingSafeEqual` em vez de `===` porque a comparação de string sai no
 * primeiro byte diferente, e a diferença de tempo vaza informação sobre o hash.
 * É barato fazer certo.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const lido = lerHash(stored);
  if (!lido) return false;
  if (lido.salt.length === 0 || lido.esperado.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password, lido.salt, KEY_LENGTH, {
    N: lido.N,
    r: lido.r,
    p: lido.p,
    maxmem: PARAMETROS_ATUAIS.maxmem,
  });

  return timingSafeEqual(derived, lido.esperado);
}

/**
 * Diz se o hash foi gerado com custo menor que o atual.
 *
 * Quem chama usa isto para regravar a senha com o custo novo NO LOGIN, quando a
 * senha em texto está disponível por um instante. É a única janela em que a
 * migração é possível — não dá para reforçar um hash sem a senha original.
 */
export function precisaRehash(stored: string): boolean {
  const lido = lerHash(stored);
  if (!lido) return false;
  return lido.legado || lido.N < PARAMETROS_ATUAIS.N || lido.p < PARAMETROS_ATUAIS.p;
}

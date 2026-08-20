import 'server-only';

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * Hash de senha do driver local.
 *
 * `scrypt` vem do próprio Node — sem dependência nativa, sem etapa de
 * compilação, e é uma KDF de custo de memória, feita para senha. Guardar
 * SHA-256 puro seria um convite a rainbow table.
 *
 * Formato guardado: `scrypt$<salt em hex>$<hash em hex>`. O sal é por usuário,
 * então duas pessoas com a mesma senha têm hashes diferentes. O prefixo
 * permite trocar de algoritmo depois sem invalidar o que já está gravado.
 *
 * No driver Supabase isto não é usado: quem guarda senha lá é o Supabase Auth.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Confere a senha em tempo constante.
 *
 * `timingSafeEqual` em vez de `===` porque a comparação de string sai no
 * primeiro byte diferente, e a diferença de tempo vaza informação sobre o
 * hash. É barato fazer certo.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password, salt, KEY_LENGTH);
  return timingSafeEqual(derived, expected);
}

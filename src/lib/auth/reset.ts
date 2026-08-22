import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mutate, read } from '@/lib/db/local/store';
import { hashPassword } from './password';
import { normalizeEmail } from './validation';

/**
 * Recuperação de senha do driver local.
 *
 * Fica FORA da interface `Repository` pelo mesmo motivo de `local.ts`: no driver
 * Supabase quem cuida disto é o Supabase Auth, e o contrato de dados não
 * deveria ter métodos que só um dos drivers implementa.
 *
 * O QUE FICA GRAVADO É O HASH DO TOKEN, nunca o token. O token só existe no
 * link que a pessoa recebe. Guardar o valor original transformaria o banco numa
 * lista de chaves prontas para entrar em qualquer conta — o mesmo raciocínio
 * que impede guardar senha em texto (ver `password.ts`).
 *
 * NÃO EXISTE ENVIO DE E-MAIL AQUI, e isso não é omissão: o driver local é
 * bloqueado em produção (`assertDriverAllowed`), existe para o projeto rodar no
 * primeiro `npm run dev`, e exigir um servidor SMTP configurado para isso
 * mataria esse objetivo. O link vai para o log do servidor, marcado como
 * desenvolvimento.
 */

/** Uma hora. Curto porque o link é uma chave; longo porque e-mail atrasa. */
const VALIDADE_MS = 60 * 60 * 1000;

export interface StoredPasswordReset {
  /** sha256 do token, em hex. O token original nunca é gravado. */
  tokenHash: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function equalTokens(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Emite um token para o e-mail informado, se ele existir.
 *
 * DEVOLVE `null` TANTO PARA E-MAIL INEXISTENTE QUANTO PARA ERRO, e quem chama
 * responde a mesma coisa nos dois casos. Uma tela que diz "e-mail não
 * encontrado" entrega de graça a lista de quem tem conta aqui — o mesmo motivo
 * pelo qual o login não diferencia senha errada de e-mail inexistente.
 */
export async function createLocalPasswordReset(email: string): Promise<string | null> {
  const alvo = normalizeEmail(email);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const agora = Date.now();

  const emitido = await mutate((db) => {
    const user = db.users.find((candidate) => candidate.email === alvo);
    if (!user) return false;

    // Pedir um link novo invalida os anteriores. Sem isto, cada pedido deixaria
    // mais uma chave válida circulando na caixa de entrada da pessoa.
    db.passwordResets = db.passwordResets.filter(
      (reset) => reset.userId !== user.id || reset.usedAt !== null
    );

    db.passwordResets.push({
      tokenHash,
      userId: user.id,
      expiresAt: new Date(agora + VALIDADE_MS).toISOString(),
      usedAt: null,
    });

    // Poda o que já não serve para nada, para o arquivo não crescer sem fim.
    const corte = new Date(agora - VALIDADE_MS).toISOString();
    db.passwordResets = db.passwordResets.filter((reset) => reset.expiresAt >= corte);

    return true;
  });

  return emitido ? token : null;
}

export type ResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalido' | 'expirado' | 'usado' };

/**
 * Troca a senha usando o token, e queima o token no mesmo passo.
 *
 * A leitura, a validação, a troca e a marcação de uso acontecem dentro de UM
 * `mutate`. Separar em duas operações abriria a janela para o mesmo link ser
 * usado duas vezes em requisições simultâneas — e a fila de escrita do store
 * só serializa cada operação, não uma sequência delas.
 */
export async function consumeLocalPasswordReset(
  token: string,
  novaSenha: string
): Promise<ResetResult> {
  if (!token) return { ok: false, reason: 'invalido' };

  const tokenHash = hashToken(token);
  // O hash da senha é calculado FORA da transação: `scrypt` é lento de
  // propósito, e segurar a fila de escrita do banco por causa dele travaria
  // todas as outras operações do processo.
  const passwordHash = await hashPassword(novaSenha);

  return mutate((db) => {
    const registro = db.passwordResets.find((reset) => equalTokens(reset.tokenHash, tokenHash));
    if (!registro) return { ok: false as const, reason: 'invalido' as const };
    if (registro.usedAt !== null) return { ok: false as const, reason: 'usado' as const };
    if (new Date(registro.expiresAt).getTime() < Date.now()) {
      return { ok: false as const, reason: 'expirado' as const };
    }

    const user = db.users.find((candidate) => candidate.id === registro.userId);
    if (!user) return { ok: false as const, reason: 'invalido' as const };

    user.passwordHash = passwordHash;
    registro.usedAt = new Date().toISOString();

    return { ok: true as const, userId: user.id };
  });
}

/** Só para diagnóstico em desenvolvimento. Nunca exposto por rota. */
export async function countLocalPasswordResets(): Promise<number> {
  return read((db) => db.passwordResets.length);
}

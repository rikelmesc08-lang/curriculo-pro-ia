import 'server-only';

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assertDriverAllowed, env } from '@/lib/env';
import { mutate, read } from './local/store';
import { podeTransicionar, type Payment, type PaymentStatus } from '@/types/payment';

/**
 * Acesso privilegiado às compras.
 *
 * POR QUE ISTO NÃO ESTÁ EM `Repository`. Aquele contrato tem uma regra que vale
 * para todos os seus métodos: TODO MÉTODO RECEBE `ownerId` E FILTRA POR ELE.
 * O webhook de pagamento não tem sessão — quem chama é o Mercado Pago, não uma
 * pessoa logada. Ele precisa encontrar uma linha pelo id do provedor, sem saber
 * de quem ela é, e escrever nela.
 *
 * Enfiar isso no repositório furaria a regra para todo o resto do produto. Aqui
 * a superfície privilegiada fica pequena, num arquivo só, e é o único lugar
 * onde a chave `service_role` é usada.
 *
 * SOBRE A CHAVE `service_role`: ela IGNORA a RLS. Nada que venha de requisição
 * de usuário pode alcançar este módulo — só a Server Action de checkout (que já
 * autenticou quem está comprando) e o webhook (que já verificou a assinatura).
 */

function agora(): string {
  return new Date().toISOString();
}

/** Cliente com poder total. Um por chamada; nunca compartilhado com o usuário. */
function adminClient() {
  const url = env.supabaseUrl();
  const chave = env.supabaseServiceRoleKey();

  /**
   * A MENSAGEM NOMEIA QUEM FALTOU, e isso não é capricho: as duas variáveis
   * são exigidas aqui, mas só uma aparecia no texto. Quando `SUPABASE_URL`
   * estava ausente, o erro acusava a chave — e a caçada ia para o lado errado,
   * atrás de uma credencial que nunca esteve com problema.
   */
  const faltando = [
    url ? null : 'SUPABASE_URL',
    chave ? null : 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((nome): nome is string => nome !== null);

  if (!url || !chave) {
    throw new Error(
      `${faltando.join(' e ')} ${faltando.length > 1 ? 'são obrigatórias' : 'é obrigatória'} ` +
        'para processar pagamentos com DB_DRIVER=supabase. ' +
        'Sem elas o webhook não consegue confirmar a compra de ninguém.'
    );
  }

  return createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function usandoSupabase(): boolean {
  assertDriverAllowed();
  return env.dbDriver() === 'supabase';
}

interface LinhaSupabase {
  id: string;
  owner_id: string;
  provider: string;
  preference_ref: string | null;
  payment_ref: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

function daLinha(linha: LinhaSupabase): Payment {
  return {
    id: linha.id,
    ownerId: linha.owner_id,
    provider: linha.provider,
    preferenceRef: linha.preference_ref,
    paymentRef: linha.payment_ref,
    status: linha.status as PaymentStatus,
    amountCents: linha.amount_cents,
    currency: linha.currency,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

const COLUNAS =
  'id, owner_id, provider, preference_ref, payment_ref, status, amount_cents, currency, created_at, updated_at';

/** Abre uma tentativa de compra, antes de mandar a pessoa para o provedor. */
export async function criarPagamento(input: {
  ownerId: string;
  provider: string;
  amountCents: number;
}): Promise<Payment> {
  const novo: Payment = {
    id: randomUUID(),
    ownerId: input.ownerId,
    provider: input.provider,
    preferenceRef: null,
    paymentRef: null,
    status: 'pendente',
    amountCents: input.amountCents,
    currency: 'BRL',
    createdAt: agora(),
    updatedAt: agora(),
  };

  if (!usandoSupabase()) {
    await mutate((data) => {
      data.payments.push(novo);
    });
    return novo;
  }

  const { data, error } = await adminClient()
    .from('payments')
    .insert({
      id: novo.id,
      owner_id: novo.ownerId,
      provider: novo.provider,
      status: novo.status,
      amount_cents: novo.amountCents,
      currency: novo.currency,
    })
    .select(COLUNAS)
    .single();

  if (error || !data) throw new Error(`falha ao criar pagamento: ${error?.message ?? 'sem retorno'}`);
  return daLinha(data as LinhaSupabase);
}

/** Guarda o id do pedido criado no provedor. */
export async function anotarPreferencia(paymentId: string, preferenceRef: string): Promise<void> {
  if (!usandoSupabase()) {
    await mutate((data) => {
      const alvo = data.payments.find((item) => item.id === paymentId);
      if (alvo) {
        alvo.preferenceRef = preferenceRef;
        alvo.updatedAt = agora();
      }
    });
    return;
  }

  await adminClient()
    .from('payments')
    .update({ preference_ref: preferenceRef, updated_at: agora() })
    .eq('id', paymentId);
}

export async function buscarPagamento(id: string): Promise<Payment | null> {
  if (!usandoSupabase()) {
    const encontrado = await read((data) => data.payments.find((item) => item.id === id));
    return encontrado ?? null;
  }

  const { data } = await adminClient().from('payments').select(COLUNAS).eq('id', id).maybeSingle();
  return data ? daLinha(data as LinhaSupabase) : null;
}

/** As compras de uma pessoa, da mais recente para a mais antiga. */
export async function listarPagamentos(ownerId: string): Promise<Payment[]> {
  if (!usandoSupabase()) {
    const lista = await read((data) => data.payments.filter((item) => item.ownerId === ownerId));
    return [...lista].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const { data } = await adminClient()
    .from('payments')
    .select(COLUNAS)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  return (data ?? []).map((linha) => daLinha(linha as LinhaSupabase));
}

export type ResultadoLiquidacao =
  | { desfecho: 'atualizado'; pagamento: Payment }
  | { desfecho: 'ignorado'; motivo: string; pagamento: Payment }
  | { desfecho: 'nao-encontrado' };

/**
 * Registra o desfecho de uma compra.
 *
 * É AQUI QUE MORA A IDEMPOTÊNCIA, e ela não é opcional: provedor de pagamento
 * reenvia notificação por retentativa, por instabilidade, e porque alguém
 * reprocessou um evento antigo no painel. A mesma notificação vai chegar duas
 * vezes — a pergunta é só se o sistema aguenta.
 *
 * Duas travas, e as duas precisam existir:
 *
 *   1. `podeTransicionar` recusa retrocesso. Notificações chegam FORA DE ORDEM,
 *      e a do "pendente" pode aterrissar depois da do "aprovado". Sem isto, uma
 *      notificação atrasada tiraria o acesso de quem já pagou.
 *
 *   2. Nada muda quando o status é o mesmo. A segunda entrega da mesma
 *      notificação não escreve nada e não dispara nada.
 */
export async function liquidarPagamento(input: {
  paymentId: string;
  paymentRef: string;
  status: PaymentStatus;
}): Promise<ResultadoLiquidacao> {
  const atual = await buscarPagamento(input.paymentId);
  if (!atual) return { desfecho: 'nao-encontrado' };

  if (!podeTransicionar(atual.status, input.status)) {
    return {
      desfecho: 'ignorado',
      motivo: `transição recusada: ${atual.status} -> ${input.status}`,
      pagamento: atual,
    };
  }

  const atualizado: Payment = {
    ...atual,
    paymentRef: input.paymentRef,
    status: input.status,
    updatedAt: agora(),
  };

  if (!usandoSupabase()) {
    await mutate((data) => {
      const alvo = data.payments.find((item) => item.id === input.paymentId);
      if (alvo) {
        alvo.paymentRef = atualizado.paymentRef;
        alvo.status = atualizado.status;
        alvo.updatedAt = atualizado.updatedAt;
      }
    });
    return { desfecho: 'atualizado', pagamento: atualizado };
  }

  const { data, error } = await adminClient()
    .from('payments')
    .update({
      payment_ref: input.paymentRef,
      status: input.status,
      updated_at: atualizado.updatedAt,
    })
    .eq('id', input.paymentId)
    .select(COLUNAS)
    .single();

  if (error || !data) throw new Error(`falha ao liquidar pagamento: ${error?.message ?? 'sem retorno'}`);
  return { desfecho: 'atualizado', pagamento: daLinha(data as LinhaSupabase) };
}

/**
 * Muda o plano da pessoa.
 *
 * SÓ ESTE CAMINHO PODE ESCREVER `plan`. A permissão do usuário no Postgres é
 * `grant update (name)` — ele não alcança a coluna nem chamando o banco direto
 * com o próprio token. Ver o bloco de COBRANÇA em `docs/schema.sql`.
 */
export async function definirPlano(ownerId: string, plan: 'gratuito' | 'pro'): Promise<void> {
  if (!usandoSupabase()) {
    await mutate((data) => {
      const usuario = data.users.find((item) => item.id === ownerId);
      if (usuario) usuario.plan = plan;
    });
    return;
  }

  const { error } = await adminClient().from('profiles').update({ plan }).eq('id', ownerId);
  if (error) throw new Error(`falha ao definir plano: ${error.message}`);
}

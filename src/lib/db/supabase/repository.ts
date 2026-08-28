import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Repository } from '@/lib/db/repository';
import type { Application, ApplicationInput, ApplicationStatus } from '@/types/application';
import type { Resume, ResumeContent, ResumeVariant, TemplateId } from '@/types/resume';
import type { AppUser } from '@/types/user';

/**
 * Driver Supabase.
 *
 * O corpo do currículo mora numa coluna `jsonb`: as seções são um documento
 * que só faz sentido inteiro, sempre lido e gravado de uma vez, e nunca
 * consultado por campo interno. Normalizar sete tabelas filhas custaria sete
 * joins por leitura sem comprar nenhuma consulta que o produto faça.
 *
 * `title`, `variant` e `template` ficam FORA do jsonb, em coluna própria, por
 * serem exatamente o que a listagem do painel precisa ler sem abrir o
 * documento.
 *
 * Toda query filtra por `owner_id` mesmo com RLS ativa no banco. A RLS é a
 * garantia; o filtro é o que faz um erro de policy virar "lista vazia" em vez
 * de "currículo de outra pessoa na tela".
 */

interface ResumeRow {
  id: string;
  owner_id: string;
  title: string;
  variant: string;
  template: string;
  content: unknown;
  created_at: string;
  updated_at: string;
}

interface ApplicationRow {
  id: string;
  owner_id: string;
  company: string;
  role: string;
  applied_at: string | null;
  status: string;
  link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AiCallRow {
  id: string;
  owner_id: string;
  task: string;
  fingerprint: string;
  result: unknown;
  created_at: string;
}

interface ProfileRow {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  created_at: string;
}

type ResumeBody = Omit<ResumeContent, 'title' | 'variant' | 'template'>;

function rowToResume(row: ResumeRow): Resume {
  const body = (row.content ?? {}) as Partial<ResumeBody>;
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    variant: row.variant as ResumeVariant,
    template: row.template as TemplateId,
    personal: body.personal ?? {
      fullName: '',
      city: '',
      state: '',
      phone: '',
      email: '',
      linkedin: '',
      portfolio: '',
      website: '',
    },
    goal: body.goal ?? { targetRole: '', area: '', summary: '' },
    experiences: body.experiences ?? [],
    education: body.education ?? [],
    certifications: body.certifications ?? [],
    skills: body.skills ?? [],
    languages: body.languages ?? [],
    projects: body.projects ?? [],
    activities: body.activities ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function contentToRow(content: ResumeContent) {
  const { title, variant, template, ...body } = content;
  return { title, variant, template, content: body as ResumeBody };
}

function rowToApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    ownerId: row.owner_id,
    company: row.company,
    role: row.role,
    appliedAt: row.applied_at ?? '',
    status: row.status as ApplicationStatus,
    link: row.link ?? '',
    notes: row.notes ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function applicationToRow(input: Partial<ApplicationInput>) {
  const row: Record<string, unknown> = {};
  if (input.company !== undefined) row.company = input.company;
  if (input.role !== undefined) row.role = input.role;
  if (input.appliedAt !== undefined) row.applied_at = input.appliedAt || null;
  if (input.status !== undefined) row.status = input.status;
  if (input.link !== undefined) row.link = input.link;
  if (input.notes !== undefined) row.notes = input.notes;
  return row;
}

/** Erro de banco vira exceção com mensagem legível — nunca um `null` mudo. */
function fail(operation: string, message: string): never {
  throw new Error(`Supabase: falha em ${operation} — ${message}`);
}

/** Linha devolvida por `public.reservar_chamada_ia`. */
interface ReservaRow {
  reserva_id: string;
  reserva_criada_em: string;
  // `count(*)` é `bigint`; o PostgREST pode serializar como número ou como
  // string dependendo da versão. Aceitar os dois e converter é mais barato que
  // depender de qual chegou.
  posicao_hora: number | string;
  posicao_dia: number | string;
}

/**
 * O erro é "essa função não existe"?
 *
 * `PGRST202` é o PostgREST não achando a função no cache de esquema;
 * `42883` é o `undefined_function` do próprio Postgres. Os dois querem dizer a
 * mesma coisa para nós: a migration ainda não rodou neste banco.
 *
 * A checagem também olha a mensagem porque o código nem sempre vem preenchido
 * em toda versão do cliente, e confundir "função ausente" com "banco fora do
 * ar" nas duas direções é caro: para um lado derruba a IA inteira por causa de
 * uma migration pendente, para o outro esconde uma falha de banco atrás de um
 * fallback silencioso.
 */
function funcaoAusente(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  const mensagem = (error.message ?? '').toLowerCase();
  return (
    mensagem.includes('reservar_chamada_ia') &&
    (mensagem.includes('does not exist') || mensagem.includes('could not find'))
  );
}

/**
 * O aviso de migration pendente sai UMA VEZ por processo, não por chamada.
 *
 * Sem isto, um banco sem a migration enche o log com uma linha por análise —
 * e um log que rola sozinho é um log que ninguém lê, justamente quando ele
 * carrega a única pista de que a corrida continua aberta.
 */
let avisouFuncaoAusente = false;

function toAppUser(row: ProfileRow): AppUser {
  return {
    id: row.id,
    email: row.email ?? '',
    name: row.name ?? '',
    plan: row.plan === 'pro' ? 'pro' : 'gratuito',
    createdAt: row.created_at,
  };
}

export function createSupabaseRepository(client: SupabaseClient): Repository {
  return {
    async findUserById(id) {
      const { data, error } = await client
        .from('profiles')
        .select('id, email, name, plan, created_at')
        .eq('id', id)
        .maybeSingle<ProfileRow>();
      if (error) fail('findUserById', error.message);
      return data ? toAppUser(data) : null;
    },

    async updateUser(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.plan !== undefined) row.plan = patch.plan;
      const { data, error } = await client
        .from('profiles')
        .update(row)
        .eq('id', id)
        .select('id, email, name, plan, created_at')
        .maybeSingle<ProfileRow>();
      if (error) fail('updateUser', error.message);
      return data ? toAppUser(data) : null;
    },

    async deleteUserData(id) {
      // As tabelas têm `on delete cascade` para o perfil, mas apagamos
      // explicitamente: se um dia alguém criar uma tabela sem cascade, este
      // código continua correto em vez de deixar resíduo pessoal no banco.
      const resumes = await client.from('resumes').delete().eq('owner_id', id);
      if (resumes.error) fail('deleteUserData/resumes', resumes.error.message);
      const applications = await client.from('applications').delete().eq('owner_id', id);
      if (applications.error) fail('deleteUserData/applications', applications.error.message);
      // O cache guarda texto derivado do currículo da pessoa. "Apagar minha
      // conta" precisa levar isto junto, senão a exclusão é parcial e a
      // promessa da tela de configurações vira mentira.
      const aiCalls = await client.from('ai_calls').delete().eq('owner_id', id);
      if (aiCalls.error) fail('deleteUserData/aiCalls', aiCalls.error.message);
      const profile = await client.from('profiles').delete().eq('id', id);
      if (profile.error) fail('deleteUserData/profile', profile.error.message);
    },

    async countAiCalls(ownerId, since, upTo) {
      // `head: true` com `count: 'exact'`: o Postgres conta no servidor e não
      // devolve linha nenhuma. Trazer as linhas só para medir `.length` traria
      // junto todo o JSON das respostas guardadas.
      let query = client
        .from('ai_calls')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .gte('created_at', since);

      if (upTo) {
        // Restringe a contagem à POSIÇÃO da reserva `upTo` na fila, não à
        // janela inteira — é isto que transforma `recordAiCall` numa senha de
        // fila (ver comentário de `src/server/ai-budget.ts`). Equivale a
        // `(created_at, id) <= (upTo.createdAt, upTo.id)`, que o PostgREST não
        // expressa como comparação de tupla direta; por isso o `.or()` com os
        // dois ramos: "criado antes" OU "criado no mesmo instante E com id
        // menor ou igual" (desempate necessário porque `created_at` só tem
        // precisão de milissegundo).
        //
        // As aspas duplas em volta de `upTo.createdAt` são obrigatórias: o
        // filtro `.or()` do PostgREST lê a string toda como uma lista de
        // condições separadas por vírgula, e um timestamp ISO contém `:` e
        // `+`/`-` (fuso horário) que, sem aspas, o parser tentaria interpretar
        // como parte da sintaxe do operador em vez de como valor.
        query = query.or(
          `created_at.lt."${upTo.createdAt}",and(created_at.eq."${upTo.createdAt}",id.lte.${upTo.id})`
        );
      }

      const { count, error } = await query;
      if (error) fail('countAiCalls', error.message);
      return count ?? 0;
    },

    /**
     * Reserva e conta as duas janelas numa transação só, no banco.
     *
     * É `rpc` e não três chamadas encadeadas porque o ponto INTEIRO é que o
     * INSERT e as contagens rodem sob a mesma trava, sem volta ao Node no
     * meio. Ver `docs/migrations/2026-08-28-reserva-atomica-ia.sql` para por
     * que a versão em três idas ao banco deixava a corrida aberta.
     *
     * A função é `security invoker`, então a RLS de `ai_calls` continua
     * valendo dentro dela: passar o `owner_id` de outra pessoa não grava nada,
     * o INSERT é recusado pela policy. O filtro por `owner_id` que todo método
     * deste driver faz continua sendo cinto e suspensório, não a garantia.
     */
    async reserveAiCall(ownerId, entry, janela) {
      const { data, error } = await client
        .rpc('reservar_chamada_ia', {
          p_owner_id: ownerId,
          p_task: entry.task,
          p_fingerprint: entry.fingerprint,
          p_desde_hora: janela.desdeHora,
          p_desde_dia: janela.desdeDia,
        })
        .single<ReservaRow>();

      if (error) {
        // Migration pendente: NÃO é erro. Devolver `null` manda o chamador
        // para o caminho antigo, que funciona — só deixa a corrida aberta.
        // Ver o comentário de `reserveAiCall` em `src/lib/db/repository.ts`.
        if (funcaoAusente(error)) {
          if (!avisouFuncaoAusente) {
            avisouFuncaoAusente = true;
            console.warn(
              '[supabase] reservar_chamada_ia ausente: usando o caminho não-atômico. ' +
                'Rode docs/migrations/2026-08-28-reserva-atomica-ia.sql para fechar a corrida do teto de IA.'
            );
          }
          return null;
        }
        fail('reserveAiCall', error.message);
      }

      return {
        id: data.reserva_id,
        createdAt: data.reserva_criada_em,
        usedInHour: Number(data.posicao_hora),
        usedInDay: Number(data.posicao_dia),
      };
    },

    async findAiCall(ownerId, fingerprint, since) {
      const { data, error } = await client
        .from('ai_calls')
        .select('*')
        .eq('owner_id', ownerId)
        .eq('fingerprint', fingerprint)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<AiCallRow>();
      if (error) fail('findAiCall', error.message);
      if (!data) return null;
      return {
        id: data.id,
        ownerId: data.owner_id,
        task: data.task,
        fingerprint: data.fingerprint,
        result: data.result,
        createdAt: data.created_at,
      };
    },

    async recordAiCall(ownerId, entry) {
      const { data, error } = await client
        .from('ai_calls')
        .insert({
          owner_id: ownerId,
          task: entry.task,
          fingerprint: entry.fingerprint,
          result: entry.result,
        })
        // `created_at` junto com `id`: é a dupla que `ai-budget.ts` devolve a
        // esta camada como `upTo` de `countAiCalls`, para a reserva contar só
        // até a própria posição na fila — não o `id` sozinho.
        .select('id, created_at')
        .single<{ id: string; created_at: string }>();
      if (error) fail('recordAiCall', error.message);
      return { id: data.id, createdAt: data.created_at };
    },

    async deleteAiCall(ownerId, id) {
      const { error } = await client.from('ai_calls').delete().eq('owner_id', ownerId).eq('id', id);
      if (error) fail('deleteAiCall', error.message);
    },

    async listResumes(ownerId) {
      const { data, error } = await client
        .from('resumes')
        .select('*')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false })
        .returns<ResumeRow[]>();
      if (error) fail('listResumes', error.message);
      return (data ?? []).map(rowToResume);
    },

    async getResume(ownerId, id) {
      const { data, error } = await client
        .from('resumes')
        .select('*')
        .eq('owner_id', ownerId)
        .eq('id', id)
        .maybeSingle<ResumeRow>();
      if (error) fail('getResume', error.message);
      return data ? rowToResume(data) : null;
    },

    async getLatestResume(ownerId) {
      const { data, error } = await client
        .from('resumes')
        .select('*')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle<ResumeRow>();
      if (error) fail('getLatestResume', error.message);
      return data ? rowToResume(data) : null;
    },

    async createResume(ownerId, content) {
      const { data, error } = await client
        .from('resumes')
        .insert({ owner_id: ownerId, ...contentToRow(content) })
        .select('*')
        .single<ResumeRow>();
      if (error) fail('createResume', error.message);
      return rowToResume(data);
    },

    async updateResume(ownerId, id, content) {
      const { data, error } = await client
        .from('resumes')
        .update({ ...contentToRow(content), updated_at: new Date().toISOString() })
        .eq('owner_id', ownerId)
        .eq('id', id)
        .select('*')
        .maybeSingle<ResumeRow>();
      if (error) fail('updateResume', error.message);
      return data ? rowToResume(data) : null;
    },

    async deleteResume(ownerId, id) {
      const { error } = await client.from('resumes').delete().eq('owner_id', ownerId).eq('id', id);
      if (error) fail('deleteResume', error.message);
    },

    async listApplications(ownerId) {
      const { data, error } = await client
        .from('applications')
        .select('*')
        .eq('owner_id', ownerId)
        .order('applied_at', { ascending: false, nullsFirst: false })
        .returns<ApplicationRow[]>();
      if (error) fail('listApplications', error.message);
      return (data ?? []).map(rowToApplication);
    },

    async createApplication(ownerId, input) {
      const { data, error } = await client
        .from('applications')
        .insert({ owner_id: ownerId, ...applicationToRow(input) })
        .select('*')
        .single<ApplicationRow>();
      if (error) fail('createApplication', error.message);
      return rowToApplication(data);
    },

    async updateApplication(ownerId, id, input) {
      const { data, error } = await client
        .from('applications')
        .update({ ...applicationToRow(input), updated_at: new Date().toISOString() })
        .eq('owner_id', ownerId)
        .eq('id', id)
        .select('*')
        .maybeSingle<ApplicationRow>();
      if (error) fail('updateApplication', error.message);
      return data ? rowToApplication(data) : null;
    },

    async deleteApplication(ownerId, id) {
      const { error } = await client
        .from('applications')
        .delete()
        .eq('owner_id', ownerId)
        .eq('id', id);
      if (error) fail('deleteApplication', error.message);
    },
  };
}

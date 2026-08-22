import { z } from 'zod';
import { newId } from '@/lib/utils';
import { parseResumeContent } from '@/lib/resume/schema';
import type { ResumeContent } from '@/types/resume';

/**
 * O formato do que a IA devolve ao importar um currículo, e a conversão dele
 * para o domínio.
 *
 * MORA SEPARADO DE `resume-import.ts` PELO MESMO MOTIVO DE `session-cookie.ts`:
 * aquele arquivo importa `server-only` e a camada de IA, o que impede carregá-lo
 * no runner de teste. Aqui não há nem framework nem rede — é só schema e
 * transformação, que é justamente a parte onde o erro é silencioso.
 *
 * O que este arquivo protege, e por isso precisa de teste: que o modelo não
 * consiga afirmar, através do formato, nada que o documento não disse. Um
 * `status: "cursando"` chutado por dedução de data vira um currículo que
 * declara uma faculdade em andamento que a pessoa largou — e ela leva isso para
 * a entrevista sem saber que foi o app que escreveu.
 */

/** Só o que uma pessoa real tem num currículo. Tetos iguais aos do schema de domínio. */
const texto = z.string().trim().max(300);
const textoLongo = z.string().trim().max(4000);

/** Lista de textos curtos, tolerante ao modelo devolver string em vez de array. */
function listaDeTextos(max: number) {
  return z.preprocess(
    (valor) => {
      if (typeof valor === 'string') return valor.trim() === '' ? [] : [valor];
      return Array.isArray(valor) ? valor : [];
    },
    z.array(texto).max(max).default([])
  );
}

/**
 * Objeto que pode simplesmente não vir na resposta.
 *
 * Todos os campos internos já têm padrão, então `{}` basta para o schema
 * preencher tudo vazio. O que faltava era o caso da CHAVE AUSENTE: no Zod 4,
 * `.default({})` exigiria repetir aqui o objeto inteiro, duplicando os padrões
 * que já estão declarados campo a campo — duas fontes de verdade para a mesma
 * coisa, que divergem na primeira alteração.
 */
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((valor) => (valor && typeof valor === 'object' ? valor : {}), schema);
}

/**
 * O que o modelo devolve — SEM `id`.
 *
 * Os ids são carimbados aqui no servidor, com `newId()`. Pedi-los ao modelo
 * seria pedir que ele inventasse identificador, e identificador inventado por
 * modelo colide — o mesmo `id` saindo repetido em duas experiências quebra a
 * lista do formulário de um jeito difícil de rastrear.
 */
export const extracaoSchema = z.object({
  personal: opcional(
    z.object({
      fullName: texto.default(''),
      city: texto.default(''),
      state: texto.default(''),
      phone: texto.default(''),
      email: texto.default(''),
      linkedin: texto.default(''),
      portfolio: texto.default(''),
      website: texto.default(''),
    })
  ),
  goal: opcional(
    z.object({
      targetRole: texto.default(''),
      area: texto.default(''),
      summary: textoLongo.default(''),
    })
  ),
  experiences: z
    .array(
      z.object({
        company: texto.default(''),
        role: texto.default(''),
        startDate: texto.default(''),
        endDate: texto.default(''),
        current: z.boolean().default(false),
        description: textoLongo.default(''),
        responsibilities: listaDeTextos(20),
        achievements: listaDeTextos(20),
      })
    )
    .max(30)
    .default([]),
  education: z
    .array(
      z.object({
        institution: texto.default(''),
        course: texto.default(''),
        degree: texto.default(''),
        startDate: texto.default(''),
        endDate: texto.default(''),
        /**
         * O `''` é o padrão E é o destino de qualquer valor estranho.
         *
         * Este campo já causou o problema uma vez: formação nascia como
         * 'cursando' e a pessoa publicava um currículo afirmando estudar algo
         * que largou — afirmação que o APP fez, não ela. Deixar o modelo
         * adivinhar aqui seria reabrir exatamente aquele defeito, agora com
         * outro culpado.
         */
        status: z
          .enum(['', 'concluido', 'cursando', 'trancado', 'incompleto'])
          .catch('')
          .default(''),
      })
    )
    .max(20)
    .default([]),
  certifications: z
    .array(
      z.object({
        name: texto.default(''),
        institution: texto.default(''),
        year: texto.default(''),
      })
    )
    .max(40)
    .default([]),
  skills: z
    .array(
      z.object({
        name: texto.default(''),
        kind: z.enum(['tecnica', 'comportamental']).catch('tecnica').default('tecnica'),
      })
    )
    .max(60)
    .default([]),
  languages: z
    .array(
      z.object({
        name: texto.default(''),
        level: z
          .enum(['basico', 'intermediario', 'avancado', 'fluente', 'nativo'])
          .catch('basico')
          .default('basico'),
      })
    )
    .max(15)
    .default([]),
  projects: z
    .array(
      z.object({
        name: texto.default(''),
        context: texto.default(''),
        description: textoLongo.default(''),
        link: texto.default(''),
      })
    )
    .max(25)
    .default([]),
  activities: z
    .array(
      z.object({
        name: texto.default(''),
        organization: texto.default(''),
        period: texto.default(''),
        description: textoLongo.default(''),
      })
    )
    .max(25)
    .default([]),
  /**
   * O que o modelo NÃO conseguiu ler com confiança.
   *
   * É a parte que a pessoa precisa olhar primeiro. Sem isto, ela teria que
   * reler o currículo inteiro para descobrir o que faltou — e não faria.
   */
  warnings: listaDeTextos(10),
});

export type Extracao = z.infer<typeof extracaoSchema>;

export interface ResumeImport {
  /** Pronto para carregar no formulário. NÃO foi salvo. */
  content: ResumeContent;
  /** O que precisa de conferência humana antes de mais nada. */
  warnings: string[];
}

/** Item sem conteúdo nenhum não vira linha em branco no formulário. */
function comAlgumTexto(valores: string[]): boolean {
  return valores.some((valor) => valor.trim() !== '');
}

/**
 * Converte a extração em conteúdo de domínio válido.
 *
 * É AQUI que os ids nascem e que a validação de verdade acontece: o resultado
 * passa por `parseResumeContent`, o mesmo portão por onde entra qualquer
 * currículo salvo. Importação não ganha caminho paralelo — se o dado não serve
 * para ser gravado, ele também não serve para ser mostrado como se fosse.
 */
export function paraConteudo(extraido: Extracao): ResumeContent {
  return parseResumeContent({
    title: 'Currículo importado',
    variant: 'geral',
    template: 'moderno',
    personal: extraido.personal,
    goal: extraido.goal,
    experiences: extraido.experiences
      .filter((item) => comAlgumTexto([item.company, item.role, item.description]))
      .map((item) => ({ ...item, id: newId() })),
    education: extraido.education
      .filter((item) => comAlgumTexto([item.institution, item.course, item.degree]))
      .map((item) => ({ ...item, id: newId() })),
    certifications: extraido.certifications
      .filter((item) => comAlgumTexto([item.name, item.institution]))
      .map((item) => ({ ...item, id: newId() })),
    skills: extraido.skills
      .filter((item) => comAlgumTexto([item.name]))
      .map((item) => ({ ...item, id: newId() })),
    languages: extraido.languages
      .filter((item) => comAlgumTexto([item.name]))
      .map((item) => ({ ...item, id: newId() })),
    projects: extraido.projects
      .filter((item) => comAlgumTexto([item.name, item.description]))
      .map((item) => ({ ...item, id: newId() })),
    activities: extraido.activities
      .filter((item) => comAlgumTexto([item.name, item.organization]))
      .map((item) => ({ ...item, id: newId() })),
  });
}

import 'server-only';

import type { AiEnvelope } from '@/types/ai';
import { runAiTask } from './index';
import { AiError, type AiAttachment } from './provider';
import { systemPrompt } from './prompts';
import {
  extracaoSchema,
  paraConteudo,
  type Extracao,
  type ResumeImport,
} from './resume-import-schema';

export type { ResumeImport } from './resume-import-schema';

/**
 * Importação do currículo que a pessoa JÁ TEM.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * Até aqui, quem chegava com um currículo pronto em PDF era recebido com
 * "Você ainda não tem um currículo salvo — preencha o formulário guiado". Ou
 * seja: para descobrir o que estava errado no currículo dela, a pessoa
 * precisava primeiro redigitá-lo inteiro. Era o maior ponto de desistência do
 * produto, e não era um problema de onde ficava o botão: o caminho não existia.
 *
 * A REGRA QUE GOVERNA TUDO AQUI
 * -----------------------------
 * `src/types/resume.ts` abre dizendo que nenhuma camada pode preencher um campo
 * com fato que o usuário não forneceu. A importação não é exceção a essa regra
 * — é o caso mais delicado dela. O fato FOI fornecido (é o currículo da
 * pessoa), mas quem o transcreve é um modelo de linguagem, que erra: junta
 * coluna, troca data, funde dois cargos num só.
 *
 * Daí as duas decisões que atravessam o arquivo:
 *
 *   1. EXTRAIR NUNCA É SALVAR. O resultado vai para o formulário, para a pessoa
 *      conferir e corrigir antes de virar currículo dela. O ganho não é "pular
 *      o formulário", é "chegar nele com tudo preenchido".
 *
 *   2. CAMPO DUVIDOSO NASCE VAZIO. Vazio é honesto: significa "não foi possível
 *      ler isto". Chute com aparência de dado lido é pior que buraco, porque
 *      ninguém revisa o que parece certo.
 */

const SISTEMA = systemPrompt(
  'Você transcreve currículos. Seu trabalho é COPIAR para um formato estruturado o que já está escrito no documento — não avaliar, não melhorar, não completar.'
);

const INSTRUCOES = [
  'Devolva um único objeto JSON com os campos abaixo, transcrevendo o currículo recebido.',
  '',
  '- personal: fullName, city, state, phone, email, linkedin, portfolio, website',
  '- goal: targetRole (cargo pretendido), area, summary (o resumo/objetivo, copiado como está)',
  '- experiences: para CADA emprego — company, role, startDate, endDate, current, description, responsibilities (uma por item), achievements (só resultados que o documento afirma)',
  '- education: para CADA formação — institution, course, degree, startDate, endDate, status',
  '- certifications: name, institution, year',
  '- skills: name e kind ("tecnica" ou "comportamental")',
  '- languages: name e level ("basico", "intermediario", "avancado", "fluente" ou "nativo")',
  '- projects: name, context, description, link',
  '- activities: name, organization, period, description',
  '- warnings: o que você NÃO conseguiu ler com segurança, em português, para a pessoa conferir',
  '',
  'REGRAS QUE NÃO PODEM SER QUEBRADAS:',
  '- Transcreva, não escreva. Se o documento não traz um dado, devolva string vazia ou lista vazia.',
  '- NUNCA invente empresa, cargo, data, curso, instituição, certificação, idioma, competência, número ou resultado.',
  '- NUNCA melhore o texto. O resumo e as descrições vão como estão, mesmo com erro de português. A melhoria é outra etapa do produto, e é escolha da pessoa.',
  '- status da formação: use "" (vazio) sempre que o documento não disser claramente a situação. Não deduza por data — um período que terminou não significa curso concluído.',
  '- current: só true com afirmação explícita ("atual", "até o momento", "presente"). Data final ausente NÃO é prova de emprego atual.',
  '- Se o documento estiver ilegível ou não for um currículo, devolva todos os campos vazios e diga isso em warnings.',
].join('\n');

/** Sem IA de verdade não há transcrição — e fingir uma seria o pior desfecho. */
function demoIndisponivel(): never {
  throw new AiError(
    'configuracao',
    'importResume',
    'Importação pedida em modo demonstração.',
    'A importação precisa de uma IA configurada para ler o seu currículo. No modo demonstração não há como transcrever um documento de verdade — preencher o formulário à mão continua funcionando.'
  );
}

/** Importa a partir do arquivo — PDF, digitalização ou foto. */
export async function importResumeFromFile(
  attachment: AiAttachment
): Promise<AiEnvelope<ResumeImport>> {
  const envelope = await runAiTask<Extracao>({
    name: 'importResume',
    maxTokens: 4000,
    // Transcrever não é julgar: o raciocínio não decide nada aqui e custa o
    // triplo do tempo. Ver `reasoning` em `provider.ts` para a medição.
    reasoning: 'minimal',
    schema: extracaoSchema,
    system: SISTEMA,
    attachment,
    prompt: ['O documento acima é um currículo.', '', INSTRUCOES].join('\n'),
    demo: demoIndisponivel,
  });

  return {
    ...envelope,
    data: { content: paraConteudo(envelope.data), warnings: envelope.data.warnings },
  };
}

/** Importa a partir do texto colado — a saída para quem não tem o arquivo em PDF. */
export async function importResumeFromText(text: string): Promise<AiEnvelope<ResumeImport>> {
  const envelope = await runAiTask<Extracao>({
    name: 'importResumeText',
    maxTokens: 4000,
    reasoning: 'minimal',
    schema: extracaoSchema,
    system: SISTEMA,
    prompt: [INSTRUCOES, '', 'CURRÍCULO A TRANSCREVER:', '', text].join('\n'),
    demo: demoIndisponivel,
  });

  return {
    ...envelope,
    data: { content: paraConteudo(envelope.data), warnings: envelope.data.warnings },
  };
}

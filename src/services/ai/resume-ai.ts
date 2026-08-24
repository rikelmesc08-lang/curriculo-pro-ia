import 'server-only';

import type {
  AiEnvelope,
  AtsAnalysis,
  CoverLetter,
  InterviewQuestion,
  JobAnalysis,
  JobMatch,
  OptimizedResume,
  RecruiterMessage,
  RecruiterMessageKind,
  ResumeReview,
  RewrittenExperience,
  RewrittenText,
} from '@/types/ai';
import type { Resume } from '@/types/resume';
import { firstName, periodLabel } from '@/lib/utils';
import { runAiTask } from './index';
import { preserveAchievements, restoredNote } from './integrity';
import {
  heuristicAts,
  heuristicReview,
  keywordCoverage,
  orderSkillsByJob,
  resumeSearchText,
} from './heuristics';
import { extractKeywords, extractTools, guessRole } from './keywords';
import { resumeAddressMap, resumeToText, systemPrompt, trimForPrompt } from './prompts';
import {
  atsAnalysisSchema,
  coverLetterSchema,
  interviewQuestionsSchema,
  jobAnalysisSchema,
  jobMatchSchema,
  optimizedResumeSchema,
  recruiterMessageSchema,
  resumeReviewSchema,
  rewrittenExperienceSchema,
  rewrittenTextSchema,
} from './schemas';
import { polishParagraph, toBullets } from './text-polish';

/**
 * Camada de serviço de IA do produto.
 *
 * É A ÚNICA PORTA. Componente não chama modelo; Server Action não monta
 * prompt. Tudo entra por uma destas funções, que devolvem sempre um
 * `AiEnvelope` — resultado mais o modo em que foi produzido, para a interface
 * poder dizer a verdade sobre o que o usuário está vendo.
 */

const MAX_JOB_CHARS = 8000;

// ---------------------------------------------------------------------------
// 1. Análise da descrição da vaga
// ---------------------------------------------------------------------------

export async function analyzeJobDescription(jobDescription: string): Promise<AiEnvelope<JobAnalysis>> {
  const job = trimForPrompt(jobDescription, MAX_JOB_CHARS);

  return runAiTask<JobAnalysis>({
    name: 'analyzeJobDescription',
    maxTokens: 2000,
    schema: jobAnalysisSchema,
    system: systemPrompt('Sua tarefa é ler uma descrição de vaga e extrair o que ela pede, sem interpretar além do que está escrito.'),
    prompt: [
      'Analise a descrição de vaga abaixo e extraia:',
      '- role: o cargo, como a vaga o nomeia',
      '- seniority: o nível (júnior, pleno, sênior, estágio, trainee) se a vaga disser; senão string vazia',
      '- company: o nome da empresa se aparecer; senão string vazia',
      '- skills: competências exigidas',
      '- tools: ferramentas e softwares citados',
      '- qualifications: formação, certificação e requisitos formais',
      '- responsibilities: o que a pessoa vai fazer no dia a dia',
      '- keywords: termos que valem aparecer no currículo de quem se candidata',
      '',
      'Não deduza nada que a vaga não diga. Campo sem informação fica vazio.',
      '',
      '=== DESCRIÇÃO DA VAGA ===',
      job,
    ].join('\n'),
    demo: () => {
      const keywords = extractKeywords(job, 20);
      const tools = extractTools(job);
      const toolSet = new Set(tools);
      return {
        role: guessRole(job),
        seniority: /est[aá]gi/i.test(job) ? 'Estágio' : /j[uú]nior/i.test(job) ? 'Júnior' : /s[eê]nior/i.test(job) ? 'Sênior' : /pleno/i.test(job) ? 'Pleno' : '',
        company: '',
        skills: keywords.filter((term) => !toolSet.has(term)).slice(0, 10),
        tools,
        qualifications: [],
        responsibilities: [],
        keywords,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// 2. Melhorar o resumo profissional
// ---------------------------------------------------------------------------

export async function improveProfessionalSummary(input: {
  resume: Resume;
  jobDescription?: string;
}): Promise<AiEnvelope<RewrittenText>> {
  const { resume } = input;
  const job = trimForPrompt(input.jobDescription ?? '', MAX_JOB_CHARS);

  return runAiTask<RewrittenText>({
    name: 'improveProfessionalSummary',
    maxTokens: 1200,
    schema: rewrittenTextSchema,
    system: systemPrompt('Sua tarefa é reescrever o resumo profissional de uma pessoa, usando somente os fatos que ela já forneceu.'),
    prompt: [
      'Reescreva o resumo profissional da pessoa em 4 a 6 linhas, em terceira pessoa impessoal, sem clichê e sem adjetivo vazio.',
      '',
      'Use APENAS o que está no currículo abaixo. Se o resumo atual estiver vazio, construa-o a partir do cargo desejado, da área, das experiências e da formação JÁ REGISTRADAS — sem acrescentar nenhuma nova.',
      'Se faltar informação essencial, diga isso em "changes" em vez de preencher.',
      '',
      'Devolva JSON: { "text": "<resumo>", "changes": ["<o que mudou e por quê>"] }',
      '',
      '=== CURRÍCULO ===',
      resumeToText(resume),
      job ? '\n=== VAGA DE REFERÊNCIA (para escolher o que destacar, nunca para inventar) ===\n' + job : '',
    ].join('\n'),
    demo: () => {
      const current = resume.goal.summary.trim();
      if (!current) {
        // Sem resumo escrito, o modo demonstração NÃO escreve um. Montar um
        // parágrafo "profissional dedicado e proativo" seria inventar traços
        // que a pessoa não afirmou — exatamente o que este produto não faz.
        return {
          text: '',
          changes: [
            'Não há resumo profissional escrito ainda, e o modo demonstração não cria texto do zero.',
            `Escreva 3 ou 4 linhas dizendo sua área${resume.goal.targetRole ? `, o cargo que busca (${resume.goal.targetRole})` : ''} e o que você já fez. Depois use este botão para melhorar a redação.`,
          ],
        };
      }
      return polishParagraph(current);
    },
  });
}

// ---------------------------------------------------------------------------
// 3. Melhorar a descrição de uma experiência
// ---------------------------------------------------------------------------

export async function improveExperience(input: {
  resume: Resume;
  experienceId: string;
  jobDescription?: string;
}): Promise<AiEnvelope<RewrittenExperience>> {
  const experience = input.resume.experiences.find((item) => item.id === input.experienceId);
  if (!experience) {
    throw new Error('Experiência não encontrada no currículo.');
  }
  const job = trimForPrompt(input.jobDescription ?? '', MAX_JOB_CHARS);

  return runAiTask<RewrittenExperience>({
    name: 'improveExperience',
    maxTokens: 1500,
    schema: rewrittenExperienceSchema,
    system: systemPrompt('Sua tarefa é transformar a descrição de uma experiência em texto profissional, preservando os fatos.'),
    prompt: [
      'Reescreva a experiência abaixo:',
      '- description: um parágrafo curto (2 a 3 linhas) sobre a atuação',
      '- responsibilities: itens objetivos, começando por verbo de ação',
      '- achievements: SOMENTE resultados que a pessoa já informou. Se ela não informou nenhum, devolva lista vazia — nunca crie número, percentual ou meta.',
      '- changes: o que você mudou',
      '',
      'Exemplo do limite: "Atendia clientes e fazia vendas" pode virar "Atendimento ao cliente e suporte durante o processo de vendas". NÃO pode virar "Aumentei as vendas em 35%".',
      '',
      '=== EXPERIÊNCIA ===',
      `Cargo: ${experience.role || '(não informado)'}`,
      `Empresa: ${experience.company || '(não informada)'}`,
      `Período: ${periodLabel(experience.startDate, experience.endDate, experience.current) || '(não informado)'}`,
      `Descrição atual: ${experience.description || '(vazia)'}`,
      `Responsabilidades atuais: ${experience.responsibilities.join(' | ') || '(nenhuma)'}`,
      `Resultados informados pela pessoa: ${experience.achievements.join(' | ') || '(nenhum)'}`,
      job ? '\n=== VAGA DE REFERÊNCIA (para escolher o vocabulário, nunca para inventar fato) ===\n' + job : '',
    ].join('\n'),
    demo: () => {
      const description = polishParagraph(experience.description);
      const responsibilities =
        experience.responsibilities.length > 0
          ? experience.responsibilities.map((item) => polishParagraph(item).text)
          : toBullets(experience.description);

      const changes = [...description.changes];
      if (experience.responsibilities.length === 0 && responsibilities.length > 0) {
        changes.push('Descrição quebrada em itens de responsabilidade.');
      }
      if (experience.achievements.length === 0) {
        changes.push(
          'Nenhum resultado foi informado, então nenhum foi criado. Se você tem um número real (metas, volume, prazo), acrescente-o no campo de resultados.'
        );
      }

      return {
        description: description.text,
        responsibilities,
        // Resultados são copiados, nunca gerados.
        achievements: experience.achievements.map((item) => polishParagraph(item).text),
        changes,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// 4. Compatibilidade entre currículo e vaga
// ---------------------------------------------------------------------------

export async function matchResumeToJob(input: {
  resume: Resume;
  jobDescription: string;
}): Promise<AiEnvelope<JobMatch>> {
  const { resume } = input;
  const job = trimForPrompt(input.jobDescription, MAX_JOB_CHARS);
  const coverage = keywordCoverage(resume, job);

  return runAiTask<JobMatch>({
    name: 'matchResumeToJob',
    maxTokens: 2500,
    schema: jobMatchSchema,
    system: systemPrompt('Sua tarefa é comparar um currículo com uma vaga e apontar aderência, pontos fortes e lacunas — com honestidade.'),
    prompt: [
      'Compare o currículo com a vaga e devolva:',
      '- score: 0 a 100, o quanto o perfil ATUAL atende a vaga. Seja realista: lacuna real derruba a nota.',
      '- strengths: o que no currículo atende a vaga',
      '- gaps: o que a vaga pede e o currículo não mostra. Para cada um: item, reason (por que ficou de fora) e suggestion (o que fazer). A sugestão NUNCA pode ser "diga que você tem" — pode ser estudar, fazer um curso, ou destacar algo equivalente que a pessoa realmente tenha.',
      '- missingKeywords: termos da vaga ausentes do currículo',
      '- recommendations: melhorias honestas e acionáveis',
      '',
      'Medição já feita por contagem de texto (use como base, não a contradiga):',
      `- termos frequentes da vaga: ${coverage.terms.join(', ') || '(nenhum)'}`,
      `- presentes no currículo: ${coverage.covered.join(', ') || '(nenhum)'}`,
      `- ausentes: ${coverage.missing.join(', ') || '(nenhum)'}`,
      '',
      '=== CURRÍCULO ===',
      resumeToText(resume),
      '',
      '=== VAGA ===',
      job,
    ].join('\n'),
    demo: () => ({
      score: coverage.percentage,
      strengths: coverage.covered.map((term) => `O termo "${term}", presente na vaga, aparece no seu currículo.`),
      gaps: coverage.missing.slice(0, 8).map((term) => ({
        item: term,
        reason: 'Aparece na descrição da vaga, mas não foi encontrado no texto do seu currículo.',
        suggestion: `Se você tem experiência real com "${term}", descreva onde e como. Se não tem, considere um curso — não escreva o que não é verdade.`,
      })),
      missingKeywords: coverage.missing,
      recommendations: [
        'Esta comparação é por presença de termo, não por entendimento do texto. Configure a IA para uma análise mais fina.',
        coverage.percentage < 50
          ? 'Menos da metade dos termos da vaga aparece no seu currículo. Reveja se você não deixou de citar algo que já faz.'
          : 'Boa parte dos termos da vaga já aparece no seu currículo.',
      ],
    }),
  });
}

// ---------------------------------------------------------------------------
// 5. Análise ATS
// ---------------------------------------------------------------------------

export async function analyzeAts(input: {
  resume: Resume;
  jobDescription?: string;
}): Promise<AiEnvelope<AtsAnalysis>> {
  const { resume } = input;
  const job = trimForPrompt(input.jobDescription ?? '', MAX_JOB_CHARS);
  const measured = heuristicAts(resume, job);

  return runAiTask<AtsAnalysis>({
    name: 'analyzeAts',
    maxTokens: 2500,
    schema: atsAnalysisSchema,
    system: systemPrompt('Sua tarefa é avaliar o quanto um currículo está preparado para leitura automática e para triagem humana rápida.'),
    prompt: [
      'Avalie o currículo nos sete critérios abaixo, cada um de 0 a 100, e devolva também um score geral e recomendações acionáveis.',
      'Critérios (use exatamente estes ids): estrutura, clareza, palavras-chave, compatibilidade, legibilidade, experiencia, competencias.',
      '',
      'Uma medição automática já foi feita por contagem de texto. Use-a como ponto de partida; discorde só se tiver motivo claro, e nunca invente cobertura de palavra-chave.',
      JSON.stringify(measured, null, 2),
      '',
      'As recomendações devem ser específicas e honestas. Ao sugerir incluir uma ferramenta ou competência, deixe explícito que só vale se a pessoa realmente tiver experiência com ela.',
      '',
      '=== CURRÍCULO ===',
      resumeToText(resume),
      job ? '\n=== VAGA ===\n' + job : '\n(Nenhuma vaga informada: o critério "compatibilidade" não pode ser medido.)',
    ].join('\n'),
    // No modo demonstração o resultado é a própria medição — que é real,
    // reproduzível e não depende de modelo nenhum.
    demo: () => measured,
  });
}

// ---------------------------------------------------------------------------
// 6. Otimização do currículo para a vaga
// ---------------------------------------------------------------------------

export async function optimizeResume(input: {
  resume: Resume;
  jobDescription: string;
}): Promise<AiEnvelope<OptimizedResume>> {
  const { resume } = input;
  const job = trimForPrompt(input.jobDescription, MAX_JOB_CHARS);
  const coverage = keywordCoverage(resume, job);

  const envelope = await runAiTask<OptimizedResume>({
    name: 'optimizeResume',
    maxTokens: 4000,
    schema: optimizedResumeSchema,
    system: systemPrompt('Sua tarefa é produzir uma versão do currículo direcionada a uma vaga específica, sem alterar nenhum fato.'),
    prompt: [
      'Produza uma versão do currículo adaptada à vaga. Devolva:',
      '- summary: resumo profissional reescrito com foco nesta vaga',
      '- experiences: para CADA experiência recebida, o mesmo "id" e os textos reescritos (description, responsibilities, achievements)',
      '- skillsOrder: os nomes das competências JÁ CADASTRADAS, reordenados por relevância para a vaga. Não acrescente nenhuma.',
      '- keywordsUsed: termos da vaga que você conseguiu usar honestamente',
      '- notes: o que a pessoa precisa revisar ou completar',
      '',
      'PROIBIÇÕES QUE VALEM AQUI EM ESPECIAL:',
      '- não crie experiência, empresa, período, curso, certificação, idioma ou competência;',
      '- não crie número, percentual nem resultado. "achievements" só repete o que a pessoa informou;',
      '- não APAGUE resultado: devolva um item em "achievements" para CADA resultado recebido, reescrito se quiser, mas nunca condensando dois em um nem omitindo algum;',
      '- não mude cargo, empresa nem datas para se parecerem mais com a vaga.',
      '',
      `Termos da vaga ausentes do currículo hoje: ${coverage.missing.join(', ') || '(nenhum)'}. Só use algum deles se o texto da pessoa já mostrar aquilo com outro nome — e diga isso em "notes".`,
      '',
      '=== CURRÍCULO ===',
      resumeToText(resume),
      '',
      '=== VAGA ===',
      job,
    ].join('\n'),
    demo: () => ({
      summary: polishParagraph(resume.goal.summary).text,
      experiences: resume.experiences.map((experience) => ({
        id: experience.id,
        description: polishParagraph(experience.description).text,
        responsibilities:
          experience.responsibilities.length > 0
            ? experience.responsibilities.map((item) => polishParagraph(item).text)
            : toBullets(experience.description),
        achievements: experience.achievements.map((item) => polishParagraph(item).text),
      })),
      skillsOrder: orderSkillsByJob(resume, job),
      keywordsUsed: coverage.covered,
      notes: [
        'Modo demonstração: os textos foram apenas formatados e as competências reordenadas por presença na vaga. Nenhuma reescrita real foi feita.',
        coverage.missing.length > 0
          ? `A vaga cita termos que não estão no seu currículo: ${coverage.missing.slice(0, 8).join(', ')}. Inclua só o que for verdade.`
          : 'Todos os termos frequentes da vaga já aparecem no seu currículo.',
      ],
    }),
  });

  return withPreservedAchievements(envelope, resume);
}

/**
 * Aplica a trava contra perda de resultado sobre um envelope já pronto.
 *
 * Fica DEPOIS do `runAiTask` e antes do retorno, de modo que todo consumidor —
 * pré-visualização, aplicação no currículo, PDF e o cache — enxergue o mesmo
 * dado corrigido. Corrigir só na hora de aplicar deixaria a tela mostrando uma
 * proposta diferente da que seria gravada.
 */
function withPreservedAchievements<
  T extends { experiences: { id: string; achievements: string[] }[]; notes: string[] },
>(envelope: AiEnvelope<T>, resume: Resume): AiEnvelope<T> {
  const { experiences, restored } = preserveAchievements(resume.experiences, envelope.data.experiences);
  if (restored === 0) return envelope;

  return {
    ...envelope,
    data: {
      ...envelope.data,
      experiences,
      // O aviso não é opcional: a pessoa precisa saber por que aquele trecho
      // veio sem reescrita, senão parece que a ferramenta falhou.
      notes: [...envelope.data.notes, restoredNote(restored)],
    },
  };
}

// ---------------------------------------------------------------------------
// 7. Carta de apresentação
// ---------------------------------------------------------------------------

export async function generateCoverLetter(input: {
  resume: Resume;
  jobDescription: string;
  company: string;
  role: string;
}): Promise<AiEnvelope<CoverLetter>> {
  const { resume, company, role } = input;
  const job = trimForPrompt(input.jobDescription, MAX_JOB_CHARS);

  return runAiTask<CoverLetter>({
    name: 'generateCoverLetter',
    maxTokens: 2000,
    schema: coverLetterSchema,
    system: systemPrompt('Sua tarefa é escrever uma carta de apresentação objetiva e honesta.'),
    prompt: [
      'Escreva uma carta de apresentação para esta candidatura. Devolva:',
      '- greeting: a saudação (use o nome da empresa se houver; nunca invente o nome de uma pessoa)',
      '- body: 3 a 4 parágrafos',
      '- closing: despedida com o nome da pessoa',
      '',
      'A carta deve: dizer a que vaga se candidata, conectar a experiência REAL da pessoa ao que a vaga pede, e fechar com disponibilidade para conversar.',
      'Não exagere, não use superlativo vazio, não afirme domínio de nada que o currículo não mostre. Máximo de 250 palavras no corpo.',
      '',
      `Empresa: ${company || '(não informada)'}`,
      `Cargo: ${role || '(não informado)'}`,
      '',
      '=== CURRÍCULO ===',
      resumeToText(resume),
      '',
      '=== VAGA ===',
      job,
    ].join('\n'),
    demo: () => {
      const name = resume.personal.fullName || 'seu nome';
      const targetRole = role || resume.goal.targetRole;
      const body: string[] = [];

      body.push(
        `Escrevo para me candidatar${targetRole ? ` à vaga de ${targetRole}` : ' à vaga divulgada'}${company ? ` na ${company}` : ''}.`
      );
      if (resume.goal.summary.trim()) {
        body.push(polishParagraph(resume.goal.summary).text);
      }
      const recent = resume.experiences[0];
      if (recent && (recent.role || recent.company)) {
        body.push(
          `Minha experiência mais recente foi como ${recent.role || '(cargo não informado)'}${recent.company ? ` na ${recent.company}` : ''}${recent.description ? `, onde ${recent.description.charAt(0).toLowerCase()}${recent.description.slice(1)}` : '.'}`
        );
      }
      body.push('Fico à disposição para conversar sobre como posso contribuir com o time.');

      return {
        greeting: company ? `Prezada equipe de recrutamento da ${company},` : 'Prezada equipe de recrutamento,',
        body,
        closing: `Atenciosamente,\n${name}`,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// 8. Preparação para entrevista
// ---------------------------------------------------------------------------

export async function generateInterviewQuestions(input: {
  resume: Resume;
  jobDescription: string;
}): Promise<AiEnvelope<{ questions: InterviewQuestion[] }>> {
  const { resume } = input;
  const job = trimForPrompt(input.jobDescription, MAX_JOB_CHARS);

  return runAiTask<{ questions: InterviewQuestion[] }>({
    name: 'generateInterviewQuestions',
    maxTokens: 4000,
    schema: interviewQuestionsSchema,
    system: systemPrompt('Sua tarefa é preparar alguém para uma entrevista real, com perguntas prováveis e orientação de resposta.'),
    prompt: [
      'Gere 10 perguntas prováveis para esta entrevista, cobrindo os tipos: comportamental, tecnica, experiencia, pontos-fortes e desenvolvimento.',
      'Para cada pergunta devolva: question, kind, howToAnswer (como abordar, considerando o histórico REAL desta pessoa) e structure (os passos de uma boa resposta).',
      '',
      'A orientação NUNCA pode sugerir mentir, inflar experiência ou omitir de forma desonesta. Para pontos de desenvolvimento, oriente a reconhecer com honestidade e mostrar o que está fazendo a respeito.',
      '',
      '=== CURRÍCULO ===',
      resumeToText(resume),
      '',
      '=== VAGA ===',
      job,
    ].join('\n'),
    demo: () => {
      const keywords = extractKeywords(job, 6);
      const questions: InterviewQuestion[] = [];

      questions.push({
        question: 'Fale um pouco sobre você e sua trajetória.',
        kind: 'experiencia',
        howToAnswer:
          'Comece pelo presente, passe pelo que te trouxe até aqui e termine no motivo de estar nesta conversa. Dois minutos bastam.',
        structure: ['O que você faz hoje', 'Como chegou até aqui', 'Por que esta vaga'],
      });

      for (const experience of resume.experiences.slice(0, 3)) {
        if (!experience.role && !experience.company) continue;
        questions.push({
          question: `Conte sobre sua atuação como ${experience.role || 'profissional'}${experience.company ? ` na ${experience.company}` : ''}.`,
          kind: 'experiencia',
          howToAnswer:
            'Descreva o contexto, o que era sua responsabilidade e o que você entregou. Use só fatos que você consegue detalhar se perguntarem mais.',
          structure: ['Contexto', 'Sua responsabilidade', 'O que você fez', 'Resultado, se houver'],
        });
      }

      for (const keyword of keywords.slice(0, 3)) {
        questions.push({
          question: `Qual sua experiência com ${keyword}?`,
          kind: 'tecnica',
          howToAnswer:
            `A vaga cita "${keyword}". Se você tem experiência, dê um exemplo concreto. Se não tem, diga que não tem e conte o que já fez de mais próximo — inventar aqui costuma cair na pergunta seguinte.`,
          structure: ['O que você já fez com isso', 'Em que contexto', 'Se não tem experiência: o mais próximo que tem'],
        });
      }

      questions.push({
        question: 'Qual você considera seu principal ponto forte?',
        kind: 'pontos-fortes',
        howToAnswer: 'Escolha um ponto forte que a vaga valorize e comprove com uma situação real do seu histórico.',
        structure: ['O ponto forte', 'Uma situação concreta', 'O efeito prático'],
      });

      questions.push({
        question: 'E um ponto que você precisa desenvolver?',
        kind: 'desenvolvimento',
        howToAnswer:
          'Diga algo verdadeiro e não essencial para a vaga, e mostre o que está fazendo a respeito. "Sou perfeccionista demais" já não engana ninguém.',
        structure: ['O ponto real', 'Como ele já te atrapalhou', 'O que você está fazendo'],
      });

      questions.push({
        question: 'Conte sobre um conflito que você enfrentou no trabalho e como resolveu.',
        kind: 'comportamental',
        howToAnswer: 'Use uma situação real. Foque no que VOCÊ fez, não em culpar a outra parte.',
        structure: ['Situação', 'Tarefa', 'Ação', 'Resultado'],
      });

      questions.push({
        question: 'Por que você quer trabalhar conosco?',
        kind: 'comportamental',
        howToAnswer: 'Ligue algo concreto da vaga ou da empresa ao que você busca na carreira. Pesquise antes.',
        structure: ['O que te chamou atenção', 'Como se conecta ao seu objetivo', 'O que você pode contribuir'],
      });

      return { questions: questions.slice(0, 10) };
    },
  });
}

// ---------------------------------------------------------------------------
// 9. Mensagem para recrutador
// ---------------------------------------------------------------------------

const MESSAGE_INTENT: Record<RecruiterMessageKind, string> = {
  'primeiro-contato': 'A pessoa está iniciando o contato com um recrutador, sem ter sido procurada antes.',
  'resposta-recrutador': 'Um recrutador procurou a pessoa e ela está respondendo.',
  'follow-up': 'A conversa parou e a pessoa quer retomar sem parecer insistente.',
  agradecimento: 'A pessoa acabou de sair de uma entrevista e quer agradecer.',
  'interesse-vaga': 'A pessoa quer demonstrar interesse numa vaga específica.',
  'atualizacao-processo': 'A pessoa quer saber em que estágio está o processo seletivo.',
};

export async function generateRecruiterMessage(input: {
  resume: Resume;
  kind: RecruiterMessageKind;
  company: string;
  role: string;
  context: string;
}): Promise<AiEnvelope<RecruiterMessage>> {
  const { resume, kind, company, role } = input;
  const context = trimForPrompt(input.context, 2000);

  return runAiTask<RecruiterMessage>({
    name: 'generateRecruiterMessage',
    maxTokens: 1200,
    schema: recruiterMessageSchema,
    system: systemPrompt('Sua tarefa é escrever mensagens curtas e profissionais para recrutadores.'),
    prompt: [
      `Situação: ${MESSAGE_INTENT[kind]}`,
      '',
      'Escreva uma mensagem curta (no máximo 120 palavras), natural, sem formalidade excessiva e sem bajulação. Devolva "subject" (assunto, vazio se for mensagem de chat) e "body".',
      'Não invente fatos sobre a pessoa nem sobre a empresa. Não prometa disponibilidade que não foi informada.',
      '',
      `Empresa: ${company || '(não informada)'}`,
      `Cargo: ${role || '(não informado)'}`,
      `Contexto extra da pessoa: ${context || '(nenhum)'}`,
      `Nome de quem assina: ${resume.personal.fullName || '(não informado)'}`,
      `Cargo/área atual da pessoa: ${resume.goal.targetRole || resume.experiences[0]?.role || '(não informado)'}`,
    ].join('\n'),
    demo: () => {
      const signature = resume.personal.fullName || '[seu nome]';
      const vaga = role || resume.goal.targetRole || '[cargo]';
      const empresa = company || '[empresa]';

      const templates: Record<RecruiterMessageKind, { subject: string; body: string }> = {
        'primeiro-contato': {
          subject: `Interesse em oportunidades de ${vaga}`,
          body: `Olá! Meu nome é ${signature} e atuo como ${vaga}. Acompanho as oportunidades da ${empresa} e gostaria de me colocar à disposição para processos na área. Deixo meu currículo em anexo, caso faça sentido para alguma posição atual ou futura. Obrigado pela atenção.`,
        },
        'resposta-recrutador': {
          subject: `Re: oportunidade de ${vaga}`,
          body: `Olá! Obrigado pelo contato. Tenho interesse na vaga de ${vaga} e fico à disposição para conversarmos. Se puder me enviar mais detalhes sobre o formato de trabalho e as próximas etapas, agradeço. Abraço, ${signature}.`,
        },
        'follow-up': {
          subject: `Acompanhamento — ${vaga}`,
          body: `Olá! Retomo nossa conversa sobre a vaga de ${vaga} na ${empresa}. Continuo interessado e à disposição para as próximas etapas. Fico no aguardo de um retorno quando for possível. Obrigado, ${signature}.`,
        },
        agradecimento: {
          subject: `Obrigado pela conversa — ${vaga}`,
          body: `Olá! Obrigado pelo tempo na entrevista de hoje sobre a vaga de ${vaga}. A conversa reforçou meu interesse na posição. Fico à disposição para qualquer informação adicional. Abraço, ${signature}.`,
        },
        'interesse-vaga': {
          subject: `Candidatura — ${vaga}`,
          body: `Olá! Vi a vaga de ${vaga} na ${empresa} e gostaria de me candidatar. Meu perfil está no currículo em anexo. Fico à disposição para conversar sobre a oportunidade. Obrigado, ${signature}.`,
        },
        'atualizacao-processo': {
          subject: `Status do processo — ${vaga}`,
          body: `Olá! Gostaria de saber se há alguma novidade sobre o processo da vaga de ${vaga} na ${empresa}. Continuo interessado e à disposição. Obrigado pela atenção, ${signature}.`,
        },
      };

      return templates[kind];
    },
  });
}

/** Saudação do painel. Fica aqui porque usa o mesmo nome do currículo. */
export function greetingName(resume: Resume | null, fallback: string): string {
  return firstName(resume?.personal.fullName || fallback) || 'tudo bem';
}

/** Reexporta para as Server Actions medirem sem reimplementar. */
export { keywordCoverage, resumeSearchText };

// ---------------------------------------------------------------------------
// 10. Análise completa do currículo
// ---------------------------------------------------------------------------

/**
 * A análise completa: diagnóstico, nota, recomendações e versão otimizada, tudo
 * numa chamada só.
 *
 * POR QUE UMA CHAMADA E NÃO CINCO: as ferramentas separadas (vaga, match, ATS,
 * otimizar) continuam existindo e são melhores quando a pessoa quer só uma
 * delas. Esta aqui é o caminho de entrada — e fazer cinco chamadas para montar
 * uma tela custaria cinco vezes a cota gratuita para responder uma pergunta só:
 * "como está meu currículo?". O modelo já lê o currículo inteiro de qualquer
 * forma; pedir tudo de uma vez é o mesmo texto de entrada com uma saída maior.
 *
 * A medição sem IA vai junto no prompt. Não é enfeite: é o que impede o modelo
 * de chutar cobertura de palavra-chave, e é exatamente o que o modo
 * demonstração devolve.
 */
export async function reviewResume(input: {
  resume: Resume;
  jobDescription?: string;
}): Promise<AiEnvelope<ResumeReview>> {
  const { resume } = input;
  const job = trimForPrompt(input.jobDescription ?? '', MAX_JOB_CHARS);
  const measured = heuristicReview(resume, job);
  const hasJob = job.trim().length > 0;

  const envelope = await runAiTask<ResumeReview>({
    name: 'reviewResume',
    maxTokens: 4000,
    schema: resumeReviewSchema,
    system: systemPrompt(
      'Você atua como recrutador sênior, especialista em RH e conhecedor de sistemas ATS. Sua tarefa é auditar um currículo com honestidade e devolver, junto do diagnóstico, uma versão reescrita dele.'
    ),
    prompt: [
      'Analise o currículo abaixo e devolva um único objeto JSON com estes campos:',
      '',
      '- score: 0 a 100, o currículo COMO ESTÁ HOJE. Seja realista; nota alta para currículo fraco não ajuda ninguém.',
      '- potentialScore: 0 a 100, o mesmo currículo depois de aplicadas as correções que você apontar. Nunca menor que score.',
      '- dimensions: uma entrada para CADA um destes oito ids, com label, score de 0 a 100 e comment:',
      '    clareza, organizacao, erros, resumo, experiencias, habilidades, palavras-chave, ats',
      '- strengths: o que já está bom',
      '- weaknesses: o que está fraco',
      '- opportunities: o que dá para melhorar e ainda não foi tentado',
      '- issues: problemas concretos. Para cada um: where (onde está, em linguagem de usuário), problem (o que está errado), fix (o que fazer), severity (alta, media ou baixa) e anchor. Ordene do mais grave para o menos grave.',
      '',
      '  O CAMPO "anchor" É O ENDEREÇO DA MARCA no PDF que a pessoa vai receber, com o problema',
      '  desenhado em cima do trecho. Ele é diferente de "where": "where" é a frase que ela lê,',
      '  "anchor" é onde a marca é pintada. Preencha assim:',
      '    anchor: { "section": "<id de uma seção da lista abaixo>", "entryId": "<id do item, quando o problema for de um item só>" }',
      '  Regras:',
      '    - use SOMENTE os ids que aparecem na lista de endereços abaixo, copiados exatamente;',
      '    - se o problema for da seção inteira (por exemplo, "faltam competências técnicas"), mande só "section";',
      '    - se o problema for de um item (uma experiência, uma formação), mande "section" e "entryId";',
      '    - se o problema não couber em nenhuma seção da lista — algo que FALTA no currículo, ou o documento como um todo —, OMITA "anchor" por completo.',
      '  Endereço errado é pior que endereço ausente: ele marca um trecho que não tem defeito e manda a pessoa reescrever o que estava bom.',
      '',
      '=== ENDEREÇOS DISPONÍVEIS NESTE CURRÍCULO ===',
      resumeAddressMap(resume),
      '',
      '- recommendations: recomendações específicas e acionáveis, na ordem em que devem ser feitas',
      '- keywords: { present: termos relevantes que já aparecem, missing: termos relevantes ausentes }',
      '- optimized: a versão profissional reescrita, com:',
      '    summary: resumo profissional reescrito',
      '    experiences: para CADA experiência recebida, o MESMO id e os textos reescritos (description, responsibilities, achievements)',
      '    skillsOrder: os nomes das competências JÁ CADASTRADAS, reordenados por relevância. Não acrescente nenhuma.',
      '    notes: o que a pessoa ainda precisa completar por conta própria',
      '',
      'PROIBIÇÕES QUE VALEM AQUI EM ESPECIAL:',
      '- não crie experiência, empresa, período, curso, certificação, idioma ou competência;',
      '- não crie número, percentual nem resultado. "achievements" só repete o que a pessoa informou;',
      '- não APAGUE resultado: devolva um item em "achievements" para CADA resultado recebido, reescrito se quiser, mas nunca condensando dois em um nem omitindo algum;',
      '- não mude cargo, empresa nem datas;',
      '- em "fix" e em "recommendations", nunca mande a pessoa afirmar o que ela não faz. Mandar estudar, fazer curso ou destacar algo equivalente que ela realmente tenha é o certo.',
      '',
      'Medição automática já feita por contagem de texto. Use como ponto de partida, discorde só com motivo claro, e nunca invente cobertura de palavra-chave:',
      JSON.stringify(
        {
          score: measured.score,
          dimensions: measured.dimensions.map((dimension) => ({
            id: dimension.id,
            score: dimension.score,
          })),
          keywords: measured.keywords,
        },
        null,
        2
      ),
      '',
      '=== CURRÍCULO ===',
      resumeToText(resume),
      hasJob
        ? '\n=== VAGA DE REFERÊNCIA (para escolher o que destacar, nunca para inventar fato) ===\n' + job
        : '\n(Nenhuma vaga informada: avalie o currículo para a área e o cargo que a própria pessoa declarou, e diga em "opportunities" que colar uma vaga deixa a análise mais precisa.)',
    ].join('\n'),
    // No modo demonstração o resultado é a própria medição — que é real,
    // reproduzível e não depende de modelo nenhum.
    demo: () => measured,
  });

  // `optimized` tem a forma que a trava espera; o resto da análise não é tocado.
  const otimizado = withPreservedAchievements(
    { ...envelope, data: envelope.data.optimized },
    resume
  );

  return { ...envelope, data: { ...envelope.data, optimized: otimizado.data } };
}

# CurrículoPro IA

> Seu currículo mais preparado para cada oportunidade.

Aplicação web para criar, melhorar e adaptar currículos para vagas de emprego
com apoio de inteligência artificial.

## A regra que atravessa o produto inteiro

**A IA reorganiza e melhora o que a pessoa escreveu. Ela não inventa nada.**

Não é slogan — é restrição implementada em três camadas independentes, porque
prompt sozinho não segura modelo de linguagem:

1. **Prompt** (`src/services/ai/prompts.ts`): as regras de integridade são
   repetidas em toda chamada, não só uma vez num prompt global.
2. **Schema** (`src/services/ai/schemas.ts`): toda saída passa por validação
   Zod antes de chegar à tela.
3. **Mesclagem** (`applyOptimizationAction`, em `src/server/actions/resume.ts`):
   experiências são casadas por `id` — um `id` inexistente é descartado; a
   ordenação de competências só reordena o que já estava cadastrado. Mesmo que
   o modelo tente acrescentar uma experiência ou uma habilidade, o código não
   deixa entrar.

O caso concreto: `"Atendia clientes e fazia vendas"` pode virar
`"Atendimento ao cliente e suporte durante o processo de vendas"`. Nunca vira
`"Aumentei as vendas em 35%"`.

## Rodando

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. **Não é preciso configurar nada** para o app
funcionar: sem variáveis de ambiente ele usa armazenamento em arquivo local e a
IA entra em modo demonstração — que não chama modelo nenhum e aparece
carimbado como demonstração em toda tela onde um resultado é exibido.

Para ligar a IA de verdade e o banco de produção, copie `.env.example` para
`.env.local` e preencha. O arquivo explica cada variável.

### Supabase

1. Crie um projeto em <https://supabase.com>.
2. Rode `docs/schema.sql` inteiro no editor SQL do projeto.
3. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env.local`.

O esquema já vem com RLS ligada e política por operação em todas as tabelas.

## Arquitetura

```
src/
  app/                  Rotas (App Router)
    (auth)/             Login e cadastro
    (legal)/            Privacidade e termos
    app/                Painel — protegido no layout, não página por página
    api/curriculo/pdf/  Geração do PDF
  components/
    ui/                 Primitivos: Button, Card, Field, Score, Stepper...
    layout/             Cabeçalhos, rodapé, barra lateral do painel
    landing/            Seções da página inicial
    resume/             Construtor, etapas, modelos e pré-visualização
    tools/              As cinco ferramentas de IA
    applications/       Acompanhamento de candidaturas
    ai/                 Avisos e casca dos resultados de IA
  hooks/                useResumeDraft, useAiAction, useJobDescription
  lib/
    auth/               Sessão, senha, validação, ações
    db/                 Repositório + drivers local e Supabase
    resume/             Regras do rascunho, schema e modelo de seções
    analytics/          Catálogo de eventos
    forms/              Tipos de retorno de Server Action
  server/actions/       Server Actions (currículo, IA, candidaturas)
  services/
    ai/                 Camada de IA: provedor, prompts, schemas, tarefas
    export/             PDF (implementado) e DOCX (declarado, não implementado)
  types/                Modelo de domínio
```

### Pontos que valem conhecer antes de mexer

**A camada de IA é a única porta.** Nenhum componente importa o SDK da
Anthropic; nenhuma Server Action monta prompt. Tudo entra por uma das funções
de `src/services/ai/resume-ai.ts`, que devolvem sempre um `AiEnvelope` —
resultado mais o modo em que foi produzido, para a interface poder dizer a
verdade sobre o que o usuário está vendo.

**Trocar de provedor** é escrever um arquivo como `services/ai/anthropic.ts` e
devolvê-lo em `getAiProvider()`. Nada fora dessa pasta muda.

**O modo demonstração não finge.** Cada tarefa carrega uma função `demo()`
determinística que só transforma o que o usuário digitou (formatar, contar,
cruzar palavras, reordenar). Nunca há fallback silencioso do provedor real para
o de demonstração: se a IA falhar, o erro sobe e a tela mostra o que aconteceu.

**Análise ATS é medição, não opinião.** A parte de cobertura de palavra-chave é
contagem de texto (`services/ai/heuristics.ts`), reproduzível e instantânea. O
resultado alimenta o prompt para o modelo não chutar cobertura — e é exatamente
o que o modo demonstração devolve, o que o torna genuinamente útil sem chave.

**Pré-visualização e PDF leem o mesmo modelo** (`lib/resume/sections.ts`). O que
a pessoa confere na tela é o que sai no arquivo, por construção, não por
disciplina de quem edita.

**Os cinco modelos são de coluna única**, sem gráfico, ícone no conteúdo, tabela
ou barra de habilidade. Currículo em duas colunas costuma ser extraído na ordem
errada pelos parsers de ATS. O que varia entre eles é tipografia, densidade e
cor de destaque.

**Dois drivers de banco.** `local` grava JSON em disco e existe para o projeto
rodar no primeiro `npm run dev`; é bloqueado em produção por
`assertDriverAllowed()`, porque disco efêmero perderia dados sem erro nenhum.
`supabase` é o de produção, com RLS.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (roda TypeScript) |
| `npm start` | Sobe o build |
| `npm run lint` | ESLint |

## Estado atual

Implementado e funcionando: landing, cadastro e login, construtor de currículo
em etapas com salvamento automático, cinco modelos, pré-visualização ao vivo,
download em PDF, análise de vaga, compatibilidade, análise ATS, otimização com
aplicação revisada, carta de apresentação, preparação para entrevista,
mensagens para recrutador, acompanhamento de candidaturas, configurações e
exclusão de conta.

Declarado e **não** implementado, de propósito e de forma visível na interface:

- **Checkout.** A tela de plano diz que a cobrança não está ativa. Nenhum
  formulário de pagamento falso, nenhum recurso bloqueado.
- **Exportação DOCX.** O exportador existe na arquitetura e recusa a chamada com
  mensagem clara, em vez de devolver um PDF renomeado.
- **Envio de eventos de analytics.** O catálogo tipado existe; nenhum destino
  externo está conectado, e a política de privacidade reflete isso.

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

### IA — camada gratuita, sem cartão

O provedor padrão é a **API Gemini, do Google**, que tem camada gratuita de
verdade. Ligar leva um minuto:

1. Acesse <https://aistudio.google.com/apikey> e entre com sua conta Google.
2. Clique em **Create API key** e escolha ou crie um projeto.
3. Cole a chave em `GEMINI_API_KEY` no seu `.env.local`.
4. Reinicie o `npm run dev`.

É a única variável necessária. **Nenhum provedor de IA é obrigatório**: sem
chave nenhuma o app continua inteiro, em modo demonstração.

O modelo padrão é `gemini-3.6-flash`, escolhido medindo a carga real deste
produto — e o critério foi **disponibilidade antes de velocidade**:

| modelo | chamadas OK | análise completa |
| --- | --- | --- |
| `gemini-3.6-flash` | 3/3 | 22,5s |
| `gemini-3.5-flash` | 3/3 | 56,7s |
| `gemini-3.7-flash` | 2/3 | 7,5s quando responde |

O 3.7 é o mais rápido de longe e foi descartado assim mesmo: um "high demand" a
cada três chamadas entrega, na média, uma espera pior — e entrega junto uma tela
de erro, que é o que o usuário lembra. Para trocar, preencha `GEMINI_MODEL`;
nome aposentado devolve uma mensagem dizendo exatamente isso, em vez de um erro
genérico de rede.

A chave nunca sai do servidor. Ela é lida só por `src/lib/env.ts` (que é
`server-only`), usada só em `src/services/ai/gemini.ts`, e toda chamada
acontece dentro de Server Action ou Route Handler.

### Supabase

1. Crie um projeto em <https://supabase.com>.
2. Rode `docs/schema.sql` inteiro no editor SQL do projeto.
3. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env.local`.
4. Em **Authentication → URL Configuration**, cadastre `{SITE_URL}/auth/recuperar`
   como Redirect URL. Sem isso o link de recuperação de senha do e-mail é
   recusado pelo Supabase.

O esquema já vem com RLS ligada e política por operação em todas as tabelas. O
arquivo é idempotente: se você já rodou uma versão anterior, rode de novo — é
assim que a tabela `ai_calls` (uso e cache da IA) entra num banco existente.

## Colocando no ar

Antes do primeiro deploy, quatro coisas que falham em silêncio se ficarem para
depois:

| O quê | Por que importa |
| --- | --- |
| `SITE_URL` com o domínio real | Sem ela, URL canônica, prévia de link e link de recuperação apontam para localhost |
| `SESSION_SECRET` preenchida | O boot é derrubado de propósito sem ela em produção |
| `docs/schema.sql` rodado | A tabela `ai_calls` sustenta o limite de uso e o cache da IA |
| Teto de execução ≥ 60s | A análise leva ~22s; as rotas declaram `maxDuration = 60` |

`robots.txt` e `sitemap.xml` são gerados por `src/app/robots.ts` e
`src/app/sitemap.ts`, **a cada requisição e não no build**: quem define
`SITE_URL` apenas como variável de execução publicaria os dois apontando para
localhost, sem nada no build acusar.

O `robots.txt` **não bloqueia** `/login`, `/cadastro`, `/esqueci-senha` nem
`/nova-senha`. É deliberado: essas páginas já declaram `index: false` nos
próprios metadados, e o buscador só enxerga essa instrução se puder abrir a
página. Bloquear no `robots.txt` impediria a leitura da meta tag — e a URL ainda
poderia ser listada, sem conteúdo, a partir de qualquer link para ela.

### Vercel

Um app Next.js sobe sem configuração nenhuma; o `vercel.json` só ajusta as três
coisas que a detecção automática não adivinha:

- **`regions: ["gru1"]` (São Paulo).** Toda página aqui é renderizada no
  servidor, então cada visita faz ida e volta até a função. Em São Paulo isso
  custa dezenas de milissegundos; na região padrão, americana, custa centenas.
  **Se usar Supabase, escolha a mesma região lá** — do contrário cada consulta
  atravessa o continente duas vezes.
- **`installCommand: "npm ci"`**, que respeita o lockfile em vez de reresolver
  versões que ninguém testou.
- **`framework: "nextjs"`**, explícito para não depender de heurística.

O tempo limite das funções **não** fica aqui: vem de `export const maxDuration =
60` nas próprias rotas, ao lado do código que depende dele, e assim vale em
qualquer plataforma.

**Não comente o `vercel.json`.** JSON não tem comentário, e o truque comum de
usar uma chave `"//"` **quebra o deploy**: a Vercel valida o arquivo contra um
schema estrito e recusa qualquer propriedade de topo que não conheça, com
`should NOT have additional property "//"`. Nada valida esse arquivo localmente
— nem `npm run build`, nem o CI — então o erro só aparece na Vercel, e derruba o
deploy inteiro antes de a build começar. Explicação vai aqui no README.

Preencha as variáveis em Settings → Environment Variables. Nenhuma é necessária
no build: o projeto não tem variável `NEXT_PUBLIC_*`, então nada é embutido no
pacote do navegador e todos os segredos são lidos em tempo de execução.

**Confira o domínio real antes de preencher `SITE_URL`.** A Vercel NÃO garante
`<nome-do-projeto>.vercel.app`: se esse endereço já pertencer a outra conta, ela
gera um com sufixo — foi o que aconteceu aqui, e o domínio virou
`curriculo-pro-ia-tau.vercel.app`. Pior, o endereço sem sufixo existia e
redirecionava para um site de terceiros, então um `SITE_URL` "óbvio" apontaria a
prévia de link e o retorno de recuperação de senha para o domínio de um
estranho, sem erro nenhum aparecer.

O valor certo está em **Settings → Domains**, no domínio marcado como
`Production`. Depois de alterar qualquer variável, é preciso **reimplantar**: a
Vercel não reaplica variável em deploy já existente.

### Contêiner (Docker, Fly, Render, Railway)

```bash
# com compose (recomendado — já traz o endurecimento do contêiner)
docker compose up --build

# ou direto
docker build -t curriculopro .
docker run -p 3000:3000 --env-file .env.local curriculopro
```

**O contêiner exige Supabase configurado.** A imagem roda com
`NODE_ENV=production`, e nesse modo o driver `local` é recusado por
`assertDriverAllowed()`: ele grava num arquivo dentro do contêiner, que some
quando o contêiner é recriado, e o usuário perderia o currículo sem ver erro
nenhum. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` antes de subir.

O build usa três estágios e a saída `standalone` do Next, ligada por
`BUILD_STANDALONE=1` — que **só o Dockerfile define**, de modo que o
`npm run build` de quem desenvolve continua igual. A imagem final roda como o
usuário `node`, sem privilégio.

O `.dockerignore` é arquivo de segurança, não de tamanho: sem ele o `COPY . .`
levaria `.env.local` (chave de API e segredo de sessão) e `.data/db.json`
(currículos reais de quem testou) para dentro de uma camada da imagem — e camada
não se apaga depois.

**Atrás de proxy TLS**, a plataforma precisa enviar `x-forwarded-proto`; é por
ele que `src/proxy.ts` decide redirecionar http para https. Vercel, Fly, Render e
Railway enviam por padrão.

A sonda de vida é `GET /api/saude`, que responde `{"ok":true}` e nada mais — sem
versão, sem ambiente, sem nome de dependência, porque é um endpoint sem
autenticação. Ela **não** consulta banco nem IA de propósito: uma sonda que
depende de serviço externo faz a plataforma reiniciar o contêiner toda vez que o
Supabase pisca, trocando uma instabilidade de fora por uma queda aqui dentro.

O último merece atenção: **as rotas que chamam IA declaram `export const
maxDuration = 60`**, que é o teto do plano gratuito da Vercel. Se a sua
plataforma impuser um limite menor, a análise falha só em produção, com erro
genérico, funcionando perfeitamente em desenvolvimento. O tempo limite do
cliente HTTP fica em 55s de propósito, abaixo do teto, para a nossa mensagem de
erro chegar antes da que a plataforma geraria.

## Arquitetura

```
src/
  app/                  Rotas (App Router)
    (auth)/             Login e cadastro
    (legal)/            Privacidade e termos
    app/                Painel — protegido no layout, não página por página
    app/analise/        Análise completa do currículo (entrada do produto)
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
  server/
    actions/            Server Actions (currículo, IA, candidaturas)
    ai-budget.ts        Cache + limite de uso, antes de qualquer chamada paga
  services/
    ai/                 Camada de IA: provedores, prompts, schemas, tarefas
      gemini.ts         Provedor padrão (camada gratuita do Google)
      anthropic.ts      Provedor opcional
      demo.ts           Sem IA nenhuma, para o app rodar sem chave
      review-gate.ts    Corte entre prévia gratuita e resultado completo
      fingerprint.ts    Identidade da pergunta, para o cache acertar
    export/             PDF (implementado) e DOCX (declarado, não implementado)
  types/                Modelo de domínio
```

### Pontos que valem conhecer antes de mexer

**A camada de IA é a única porta.** Nenhum componente conhece provedor de IA;
nenhuma Server Action monta prompt. Tudo entra por uma das funções de
`src/services/ai/resume-ai.ts`, que devolvem sempre um `AiEnvelope` — resultado
mais o modo em que foi produzido, para a interface poder dizer a verdade sobre o
que o usuário está vendo.

**Trocar de provedor** é escrever um arquivo que implemente `AiProvider` e somar
uma linha ao mapa `PROVIDERS` em `services/ai/index.ts`. Nada fora dessa pasta
muda. Hoje existem três: `gemini` (padrão), `anthropic` (opcional) e `demo`.

**Nenhum SDK de provedor é dependência.** Gemini e Anthropic são falados por
`fetch` — a chamada é um POST com JSON, e um pacote por provedor só traria peso
e ciclo de atualização para embrulhar quinze linhas.

**A IA tem orçamento.** Toda chamada passa por `src/server/ai-budget.ts`, que faz
três coisas nesta ordem: devolve do cache quando a pergunta se repete (sem
consumir cota), recusa acima do limite por hora e por dia, e só então chama o
provedor. Sem isso, uma tela de IA autenticada é uma conta de API aberta para
quem tiver um login e um laço de repetição.

**O corte entre gratuito e pago acontece no servidor.** `services/ai/review-gate.ts`
monta a prévia campo a campo a partir do resultado completo — nunca espalha o
objeto inteiro e apaga campos depois. Quem está no plano gratuito recebe um
objeto que jamais conteve o texto pago; esconder no cliente seria entregá-lo a
qualquer pessoa que abrisse as ferramentas de desenvolvedor.

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
| `npm test` | Testes (`node --test`, sem framework externo) |
| `npm run test:watch` | Testes reexecutando a cada alteração |

A versão do Node fica em `.nvmrc` — uma fonte só, lida por quem desenvolve e
pelo CI.

## Integração contínua

`.github/workflows/ci.yml` roda no push da `main` e em todo pull request: ESLint,
verificação de tipos, testes e build, nessa ordem — do mais barato para o mais
caro, para um erro de lint não custar o build inteiro até aparecer.

**O job não define variável de ambiente nenhuma**, e essa é a checagem mais
valiosa do arquivo: o projeto tem que continuar buildando e testando sem chave de
API, sem Supabase e sem segredo de sessão. No dia em que alguém tornar alguma
delas obrigatória para o build, quebra ali — e não no primeiro `git clone` de
outra pessoa.

## Estado atual

Implementado e funcionando: landing, cadastro e login, construtor de currículo
em etapas com salvamento automático, cinco modelos, pré-visualização ao vivo,
download em PDF, **análise completa do currículo** (nota de 0 a 100, oito
dimensões, problemas com correção, recomendações e versão reescrita), análise de
vaga, compatibilidade, análise ATS, otimização com aplicação revisada, carta de
apresentação, preparação para entrevista, mensagens para recrutador,
acompanhamento de candidaturas, configurações e exclusão de conta.

Controle de custo de IA implementado: cache por pergunta, limite por hora e por
dia por usuário, corte de tamanho da entrada e mensagem específica quando a cota
gratuita do provedor acaba.

**Recuperação de senha** funciona nos dois drivers, por caminhos diferentes:
no `supabase`, o Supabase Auth envia o e-mail e o retorno passa por
`/auth/recuperar`, que troca o código por sessão (Route Handler, porque Server
Component não escreve cookie); no `local`, o link vai para o log do servidor,
marcado como desenvolvimento — aquele driver existe para o projeto rodar sem
configurar serviço nenhum, e exigir SMTP mataria esse objetivo. O token é
gravado como hash, vale uma hora, serve uma vez só, e pedir um novo invalida o
anterior.

Declarado e **não** implementado, de propósito e de forma visível na interface:

- **Checkout.** A tela de plano diz que a cobrança não está ativa. Nenhum
  formulário de pagamento falso.

  O corte entre a prévia gratuita e a análise completa **já está implementado e
  coberto por teste** (`services/ai/review-gate.ts`), mas vem **desligado**: com
  `AI_PAYWALL=on` a pessoa clicaria em "desbloquear" e chegaria numa tela
  dizendo que não dá para pagar. Ligue no dia em que o checkout existir.
- **Exportação DOCX.** O exportador existe na arquitetura e recusa a chamada com
  mensagem clara, em vez de devolver um PDF renomeado.
- **Envio de eventos de analytics.** O catálogo tipado existe; nenhum destino
  externo está conectado, e a política de privacidade reflete isso.

- **Limite de pedidos de recuperação de senha.** No driver `supabase` quem
  limita é o próprio Supabase Auth. No `local` não há limite — e não faz
  diferença, porque ali nenhum e-mail é enviado e o driver é bloqueado em
  produção. Se um dia um servidor SMTP próprio entrar no lugar, este limite
  passa a ser obrigatório antes de subir.

'use strict';

/**
 * Configuração do PM2 para o caminho "Node direto no VPS, sem Docker".
 *
 * ESTE ARQUIVO NÃO É USADO PELO CAMINHO DOCKER — o `Dockerfile` já cuida do
 * próprio ciclo de vida do processo (`CMD ["node", "server.js"]` mais o
 * `HEALTHCHECK` da imagem) e roda sem PM2 dentro do contêiner. Este arquivo é
 * para quando a Hostinger for uma VM comum, sem Docker: o PM2 assume o papel
 * que o Docker faz lá — manter o processo vivo, reiniciar em caso de queda e
 * subir junto do sistema operacional.
 *
 * POR QUE `.cjs` E NÃO `.js`: hoje `package.json` NÃO declara `"type":
 * "module"` (conferido antes de escrever isto), então um `.js` funcionaria
 * igual neste exato momento — o PM2 carrega este arquivo com `require()`, que
 * espera CommonJS, e é isso que `module.exports` abaixo entrega. A extensão
 * `.cjs` deixa essa exigência EXPLÍCITA e à prova do futuro: o resto do
 * projeto (`next.config.ts`, os módulos de `src/`) já escreve `import`/
 * `export` no estilo ESM, compilado pelo TypeScript/Next — se um dia alguém
 * adicionar `"type": "module"` ao `package.json` para alinhar o resto do
 * repositório a isso, um `ecosystem.config.js` pararia de funcionar (o
 * `require()` do PM2 quebraria), e um `ecosystem.config.cjs` continuaria
 * funcionando sem precisar de nenhuma mudança aqui.
 *
 * APONTA PARA O BUILD STANDALONE, não para `next start`: `next start` precisa
 * do `node_modules` inteiro presente no servidor; o standalone (gerado por
 * `npm run build:standalone`, ver `scripts/build-standalone.js`) já empacota
 * só o que o código alcança, junto com um `server.js` autocontido — é o mesmo
 * artefato que o `Dockerfile` usa, só que rodado direto no host em vez de
 * dentro de um contêiner.
 */
module.exports = {
  apps: [
    {
      name: 'curriculo-pro-ia',

      // Caminho RELATIVO à raiz deste arquivo (PM2 resolve com `cwd` abaixo).
      // Gerado por `npm run build:standalone`; não existe até essa build
      // rodar pelo menos uma vez.
      script: '.next/standalone/server.js',

      // Sem isto, o PM2 usa o diretório de onde `pm2 start` foi chamado, que
      // pode não ser a raiz do projeto se alguém rodar o comando de outro
      // lugar. `__dirname` é sempre a pasta deste arquivo.
      cwd: __dirname,

      /**
       * INSTÂNCIA ÚNICA, DE PROPÓSITO — NÃO É AJUSTE DE PERFORMANCE PENDENTE.
       *
       * O limite de tentativas de login (`src/lib/auth/throttle.ts`) guarda o
       * contador NA MEMÓRIA DO PROCESSO, e o próprio arquivo documenta a
       * limitação: com várias instâncias, cada uma tem seu próprio contador, e
       * um atacante distribuído enfrenta o limite multiplicado pelo número de
       * instâncias — não o limite configurado. O controle de custo de IA
       * (`src/server/ai-budget.ts`) já conta no banco e seria seguro em
       * cluster; o throttle de login é que não é, hoje.
       *
       * Subir para mais de uma instância exige primeiro trocar o contador de
       * `throttle.ts` por algo compartilhado (Redis, ou uma função no
       * Postgres) — o próprio arquivo já deixa essa migração documentada.
       * Até lá, `instances: 1` é o valor CORRETO, não um valor provisório
       * esquecido aqui.
       */
      instances: 1,

      // `fork`, não `cluster`: `cluster` é o modo do PM2 que sobe várias
      // instâncias atrás de um balanceador interno — sem sentido com
      // `instances: 1`, e o comentário acima existe assim mesmo para quem for
      // mudar os dois juntos no futuro.
      exec_mode: 'fork',

      // Reinicia sozinho se o processo cair (exceção não tratada, OOM etc).
      autorestart: true,

      /**
       * Trava contra loop de reinício. Se o processo morrer e nascer de novo
       * em menos de 10s, PM2 não conta como "ficou de pé" — depois de
       * `max_restarts` reinícios nessa condição, ele DESISTE e marca o app
       * como `errored` em vez de consumir CPU reiniciando para sempre um
       * processo que só vai cair de novo (ex.: variável de ambiente
       * obrigatória faltando, porta já em uso).
       */
      min_uptime: '10s',
      max_restarts: 10,

      // Não observa arquivo nenhum para reiniciar sozinho. Deploy é um passo
      // explícito (build + `pm2 reload`), não um efeito colateral de salvar
      // um arquivo em produção.
      watch: false,

      /**
       * Variáveis de ambiente do PROCESSO, não da APLICAÇÃO.
       *
       * SÓ PORT, HOSTNAME E NODE_ENV — NENHUM SEGREDO AQUI. Este arquivo é
       * versionado no Git; `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
       * `SESSION_SECRET`, `MERCADOPAGO_ACCESS_TOKEN` e
       * `MERCADOPAGO_WEBHOOK_SECRET` continuam vindo de `.env.local` (ou do
       * gerenciador de segredo do servidor) — nunca daqui. `src/lib/env.ts` já
       * lê tudo isso via `process.env` em tempo de execução; o PM2 só precisa
       * garantir que essas variáveis estejam no ambiente do processo antes de
       * ele subir, o que normalmente é feito carregando `.env.local` ANTES de
       * chamar `pm2 start` (`export $(grep -v '^#' .env.local | xargs)` ou
       * equivalente), não escrevendo os valores aqui.
       *
       * PORT e HOSTNAME são as mesmas duas variáveis que o `Dockerfile` já
       * define para o `runner` (ver o comentário em `src/lib/env.ts`, seção
       * "PORT e HOSTNAME"): o `server.js` gerado pelo Next as lê sozinho para
       * decidir porta e interface de rede. `0.0.0.0` é obrigatório aqui pelo
       * mesmo motivo que é no Docker — sem isso o processo só aceita conexão
       * de `localhost`, e o Nginx na frente dele (rodando como outro
       * processo, não dentro do mesmo `localhost` de contêiner) não alcança.
       */
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};

# ---------------------------------------------------------------------------
# Imagem de produção do CurrículoPro IA.
#
# Três estágios, e o motivo de não ser um só: o que compila o projeto precisa do
# TypeScript, do ESLint e de todo o `node_modules` de desenvolvimento — cerca de
# meio gigabyte que não tem função nenhuma em produção, e que só aumenta a
# superfície de ataque de quem receber a imagem.
#
# NENHUM SEGREDO É NECESSÁRIO NO BUILD. Este projeto não tem variável
# `NEXT_PUBLIC_*`, então nada é embutido no pacote que o navegador baixa: a
# chave da IA, o Supabase e o segredo de sessão são lidos só em tempo de
# execução. Não passe `--build-arg` com segredo; ele ficaria gravado na camada.
# ---------------------------------------------------------------------------

# A versão acompanha o .nvmrc. `slim` em vez de `alpine`: o Alpine usa musl, e o
# scrypt do `node:crypto` e o gerador de PDF já deram dor de cabeça nessa libc
# em projetos parecidos. A diferença de tamanho não paga o risco.
ARG NODE_VERSION=24-slim


# --- 1. Dependências -------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Só os manifestos primeiro: enquanto eles não mudarem, o Docker reaproveita a
# camada de instalação inteira e o build fica em segundos.
COPY package.json package-lock.json ./

# `npm ci` e não `install`: instala exatamente o lockfile e falha se ele estiver
# fora de sincronia, em vez de resolver versões diferentes das que foram testadas.
RUN npm ci


# --- 2. Build --------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Liga a saída `standalone` (ver next.config.mjs). Só o build de contêiner define
# isto; o `npm run build` de quem desenvolve continua igual.
ENV BUILD_STANDALONE=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# --- 3. Execução -----------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# USUÁRIO SEM PRIVILÉGIO. Um processo Node rodando como root transforma qualquer
# execução remota de código em controle total do contêiner. A imagem `node` já
# traz o usuário `node`; basta usá-lo.
USER node

# `standalone` traz o servidor e apenas as dependências que o código alcança.
# `.next/static` fica FORA dele e precisa ser copiado à parte — sem isto o site
# sobe respondendo 200 e sem CSS nenhum.
#
# Não há `COPY` de `public/` porque este projeto não tem essa pasta: ícone e
# imagem de compartilhamento são gerados por código (`src/app/icon.svg`,
# `opengraph-image.tsx`). Se um dia ela existir, acrescente a linha — senão os
# arquivos dela simplesmente não estarão na imagem.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

EXPOSE 3000

# Sonda de vida: só diz que o processo responde. NÃO checa banco nem IA de
# propósito — um health check que depende de serviço externo faz a plataforma
# reiniciar o contêiner toda vez que o Supabase pisca, trocando uma instabilidade
# de fora por uma queda aqui dentro.
# `process.exitCode` em vez de `process.exit()`: chamar `exit` de dentro do
# callback de uma promessa encerra o processo com trabalho ainda na fila do
# libuv, e o próprio encerramento pode falhar — transformando uma sonda
# bem-sucedida em contêiner reiniciado. Definir o código e deixar o Node
# terminar sozinho não tem essa corrida. (Visto acontecendo ao testar aqui.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/saude').then(r=>{process.exitCode=r.ok?0:1}).catch(()=>{process.exitCode=1})"

CMD ["node", "server.js"]

#!/usr/bin/env node

/**
 * Build de produção em modo `standalone`, fora do Docker.
 *
 * PROBLEMA QUE ESTE ARQUIVO RESOLVE: `next.config.mjs` liga `output: 'standalone'`
 * quando `process.env.BUILD_STANDALONE === '1'` (ver o comentário lá). A forma
 * óbvia de setar isso na linha de comando é o prefixo de shell POSIX —
 * `BUILD_STANDALONE=1 npm run build` — e essa sintaxe FUNCIONA no bash do
 * servidor Linux (Hostinger) e QUEBRA no PowerShell da máquina de
 * desenvolvimento (Windows 11): o PowerShell não reconhece `VAR=valor` como
 * prefixo de variável de ambiente e tenta executar `BUILD_STANDALONE=1` como
 * se fosse, ele mesmo, um comando — erro imediato, "termo não reconhecido".
 *
 * A saída escolhida foi não depender de sintaxe de shell nenhuma: setar a
 * variável aqui dentro do Node, que interpreta `process.env` do mesmo jeito em
 * qualquer sistema operacional, e chamar o `next build` a partir do mesmo
 * processo. Isso evita acrescentar uma dependência nova só para resolver isto
 * (`cross-env` faria o mesmo, mas é mais uma entrada em `package.json` para um
 * problema de dez linhas).
 *
 * EXTENSÃO `.mjs`, NÃO `.js` ATRÁS DE `require()`: o ESLint deste projeto
 * (`eslint.config.mjs`, regra `@typescript-eslint/no-require-imports`) proíbe
 * `require()`, e o resto do repositório já usa `import`/`export`. Um `.js`
 * puro herdaria CommonJS por padrão (`package.json` não declara `"type":
 * "module"`) e forçaria `require()`; `.mjs` é ESM sem depender desse campo,
 * igual a `eslint.config.mjs` e `postcss.config.mjs` já fazem neste projeto.
 *
 * O QUE MAIS ESTE SCRIPT FAZ, além de rodar o build: copia `.next/static`
 * (e `public/`, se um dia existir) para dentro de `.next/standalone`. O
 * `Dockerfile` já faz esse mesmo copy manualmente no estágio `runner`, com o
 * comentário explicando por quê: a saída `standalone` do Next embute só o
 * servidor e as dependências que o código alcança — os arquivos estáticos
 * (CSS, chunks de JS versionados) ficam FORA dela de propósito. Sem essa
 * cópia, o site sobe respondendo 200 e sem CSS nenhum. Dentro do Docker, quem
 * copia é o `COPY --from=builder` do Dockerfile; para quem roda o standalone
 * direto no VPS (caminho PM2, sem contêiner), quem copia é este script —
 * assim `node .next/standalone/server.js` funciona sozinho, sem passo manual
 * extra para lembrar.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.BUILD_STANDALONE = '1';

// Resolve o executável do Next pelo próprio resolvedor de módulos do Node
// (`import.meta.resolve`, síncrono desde o Node 22 — este projeto pede Node
// 24 em `.nvmrc`), e não pelo PATH: assim funciona igual em Windows e Linux,
// sem depender de `.cmd`/`.ps1` gerados pelo npm em `node_modules/.bin` nem de
// o binário estar no PATH do shell que chamou este script.
const nextBin = fileURLToPath(import.meta.resolve('next/dist/bin/next'));

const build = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: RAIZ,
  stdio: 'inherit',
  env: process.env,
});

if (build.status !== 0) {
  // `status` vem `null` quando o processo morre por sinal (ex.: Ctrl+C); nesse
  // caso 1 é uma saída de erro tão válida quanto qualquer outra.
  process.exit(build.status ?? 1);
}

/**
 * Copia recursiva simples. `fs.cpSync` já faz isso nativamente desde o Node
 * 16.7 — a versão mínima deste projeto é a 24 (ver `.nvmrc`) — então não há
 * necessidade de escrever a recursão à mão nem de puxar dependência para isto.
 */
function copiarSeExistir(origem, destino) {
  if (!fs.existsSync(origem)) return;
  fs.cpSync(origem, destino, { recursive: true });
  console.log(`[build-standalone] copiado: ${path.relative(RAIZ, origem)} -> ${path.relative(RAIZ, destino)}`);
}

const standaloneDir = path.join(RAIZ, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  console.error(
    '[build-standalone] build concluído, mas .next/standalone não existe. ' +
      'Confira se next.config.mjs ainda lê BUILD_STANDALONE para ligar output: "standalone".'
  );
  process.exit(1);
}

copiarSeExistir(path.join(RAIZ, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
// Este projeto não tem pasta `public/` hoje — ícone e imagem de
// compartilhamento são gerados por código (ver o comentário equivalente no
// Dockerfile). A cópia é defensiva: se um dia a pasta existir, o build
// standalone continua funcionando sem precisar lembrar de atualizar este
// script.
copiarSeExistir(path.join(RAIZ, 'public'), path.join(standaloneDir, 'public'));

console.log('[build-standalone] pronto. Suba com: npm run start:standalone (ou pm2 start ecosystem.config.cjs)');

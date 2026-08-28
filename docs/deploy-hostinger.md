# Deploy na Hostinger (VPS)

> # ⚠️ PARE — ESTE NÃO É MAIS O CAMINHO RECOMENDADO
>
> **Verificado em 24/08/2026, direto no painel do dono:** a Hostinger tem um
> produto **Web App Node.js** nos planos de hospedagem compartilhada, com
> deploy por push no GitHub, variáveis de ambiente e logs de execução — e a
> conta **já roda um Next.js nele** (`aproveienem.com`, Next.js 16.3.0,
> Node 22.x, com rota de API, webhook de pagamento e middleware funcionando).
>
> O CurrículoPro IA usa Next.js 16.3.1. **Ele cabe ali.** Não é preciso VPS,
> nem Docker, nem PM2, nem Nginx, nem Certbot — nada do que este guia ensina
> das seções 2 a 4.
>
> Existe um plano **Unlimited** ocioso na conta (expira 2027-08-21, mesma data
> do domínio `curriculoproia.online`), sem site configurado. É onde publicar.
>
> **A afirmação abaixo, de que hospedagem compartilhada "não serve em nenhum
> plano", ESTÁ ERRADA** e ficou registrada por honestidade. Ela valia para o
> produto compartilhado clássico (só PHP/MySQL), não para o Web App Node.js.
>
> **O caminho que está no ar é o Web App Node.js, e ele tem documento
> próprio: [`deploy-web-app-nodejs.md`](deploy-web-app-nodejs.md).** É lá que
> estão o deploy por push, as variáveis no painel, o que o CDN da Hostinger
> faz com os cabeçalhos, as duas armadilhas do painel (um push que não
> dispara a implantação; o botão "Reimplantar", que pode gravar as variáveis
> de ambiente truncadas e derrubar as credenciais) e a recuperação de
> desastre. Comece por ele.
>
> **Este guia continua útil como plano B** — se um dia o app passar dos
> limites do plano compartilhado, ou se a Hostinger descontinuar o Web App
> Node.js, o caminho de VPS está aqui, testado e completo. As seções 5
> (variáveis de ambiente), 6 (webhook do Mercado Pago) e 7 (ler o log)
> valem para os dois caminhos, e o documento do Web App aponta para elas em
> vez de duplicá-las.

Este guia leva o CurrículoPro IA da Vercel para um servidor próprio na
Hostinger, com o domínio `curriculoproia.online`. É um passo a passo de
cliques e comandos — sem experiência prévia de administrar servidor.

**Antes de tudo, o fato que decide todo o resto:** este app precisa de um
processo Node.js **ligado o tempo todo**. Não é uma versão de site que vira
um monte de arquivos HTML prontos — ele responde pagamento em tempo real
(`src/app/api/pagamento/webhook/route.ts`), gera PDF na hora
(`@react-pdf/renderer`), roda 20 Server Actions (`src/server/actions/`) e monta um cabeçalho de
segurança novo em cada requisição (`src/proxy.ts`). Esse fato continua
verdadeiro — o que mudou é que o Web App Node.js da Hostinger **entrega** esse
processo ligado, coisa que a hospedagem compartilhada clássica não fazia.

---

## 1. Descobrir o que você tem

1. Entre em <https://hpanel.hostinger.com> com a conta que comprou o domínio
   `curriculoproia.online`.
2. Procure, no menu principal (a barra lateral ou o painel inicial — a
   Hostinger reorganiza essa tela de tempos em tempos), por duas seções
   possíveis: uma chamada algo como **"Hospedagem"** / **"Sites"** / **"Web
   Hosting"**, e outra chamada **"VPS"**.
   - Se só existir a primeira, você tem **hospedagem compartilhada**.
   - Se existir **"VPS"** com um servidor listado — endereço IP, sistema
     operacional, botão de "Gerenciar" ou de terminal — você já tem um
     **VPS** e pode pular direto para a seção 2.
3. Um teste que não depende de a interface ter mudado: hospedagem
   compartilhada **nunca** oferece acesso SSH como `root` nem escolha de
   sistema operacional — ela entrega um gerenciador de arquivos, banco MySQL
   e PHP já prontos, sem terminal de verdade. Um VPS sempre mostra um
   endereço IP dedicado seu e alguma forma de abrir um terminal (ou as
   instruções para conectar por SSH).
4. Na dúvida, o caminho mais confiável é abrir o chat de suporte da
   Hostinger e perguntar diretamente: *"meu plano atual é hospedagem
   compartilhada ou VPS?"*.

### Se for hospedagem compartilhada

Isto **não é uma configuração que falta ligar** — é a ausência completa da
peça que falta. Hospedagem compartilhada divide um mesmo servidor entre
milhares de contas e só sabe responder pedidos de arquivo PHP gerados na
hora; ela não tem como manter um programa seu rodando continuamente à
espera de requisições, o que este app precisa fazer o tempo todo. Nenhuma
configuração dentro do painel muda isso.

As opções, sem eu recomendar qual comprar — essa decisão é sua:

- **Fazer upgrade para um VPS dentro da própria Hostinger.** Os planos de
  entrada da linha "VPS" costumam ser os mais baratos do catálogo deles,
  mas o preço muda com frequência e por promoção — **confira o valor atual
  em hostinger.com antes de decidir**, não confie num número deste
  documento.
- **Contratar um VPS em outro provedor** (por exemplo DigitalOcean, Hetzner,
  Vultr) e continuar usando a Hostinger só para registrar o domínio e gerir
  o DNS — as duas coisas não precisam ser da mesma empresa. O passo 4 deste
  guia (apontar o domínio) funciona igual, trocando só o IP de destino.

Se for VPS, siga para a seção 2.

---

## 2. Os dois caminhos no VPS

O projeto já traz tudo pronto para dois caminhos. **Recomendo o Caminho A
(Docker)**: o `compose.yaml` já vem com o endurecimento de segurança feito
(usuário sem privilégio, sistema de arquivos somente leitura, sonda de
vida) e você não precisa instalar Node, gerenciar versão nem configurar
início automático na mão — o Docker Engine cuida de tudo isso sozinho.
Use o Caminho B só se o seu VPS não tiver como instalar Docker, ou se você
já tiver preferência por rodar Node direto no servidor.

As duas seções abaixo partem de uma conexão SSH já aberta no VPS:

```bash
ssh root@SEU_IP_DO_VPS
```

Troque `SEU_IP_DO_VPS` pelo endereço que aparece no painel VPS da
Hostinger. Espera-se que a Hostinger tenha entregue um sistema baseado em
Ubuntu ou Debian nos templates padrão de VPS — os comandos `apt` abaixo
assumem isso; se o seu sistema for outro, o gerenciador de pacotes muda,
mas os comandos do projeto (Docker, `git`, `npm`) são os mesmos.

### Caminho A — Docker (recomendado)

```bash
# 1. Instala o Docker Engine e o plugin `docker compose` pelo script
#    oficial do próprio Docker.
curl -fsSL https://get.docker.com | sh
```
Espera-se ver o instalador rodando até uma mensagem final confirmando a
instalação. Confirme com:
```bash
docker --version
docker compose version
```
Espera-se uma linha de versão em cada comando (ex.: `Docker version
2X.x.x`) — erro de "comando não encontrado" significa que a instalação
falhou.

```bash
# 2. Traz o código do projeto para o servidor.
git clone https://github.com/rikelmesc08-lang/curriculo-pro-ia.git
cd curriculo-pro-ia
```
Espera-se uma pasta `curriculo-pro-ia` criada, com os arquivos do projeto
dentro (confira com `ls`).

```bash
# 3. Cria o arquivo de segredos, ainda vazio.
nano .env.local
```
Cole dentro dele as variáveis da tabela da seção 5 (não copie a variável
`PORT` nem `HOSTNAME` — o `Dockerfile` já as define sozinho). Salve com
`Ctrl+O`, `Enter`, e saia com `Ctrl+X`.

```bash
# 4. Restringe quem pode ler o arquivo de segredos.
chmod 600 .env.local
```

```bash
# 5. Constrói a imagem e sobe o contêiner em segundo plano.
docker compose up --build -d
```
Isso demora alguns minutos na primeira vez (o build de produção do Next
roda dentro do contêiner). Espera-se, ao final, uma linha dizendo que o
serviço `app` foi criado e está `running` ou `healthy`.

```bash
# 6. Confirma que o processo está de pé, sem expor a porta à internet ainda.
curl http://localhost:3000/api/saude
```
Espera-se a resposta `{"ok":true}`. Se vier erro de conexão recusada,
veja a seção 7 (logs).

O contêiner já reinicia sozinho se cair (`restart: unless-stopped`, em
`compose.yaml`) e se reinicia junto do sistema, porque o próprio Docker
sobe no boot do VPS. Não é preciso PM2 nem `systemd` neste caminho.

### Caminho B — Node + PM2

```bash
# 1. Instala o Node 24 (a versão que .nvmrc pede) pelo repositório oficial
#    da NodeSource.
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
```
Confirme com `node -v` — espera-se algo como `v24.x.x`. Se a distribuição
do seu VPS não for baseada em Debian/Ubuntu, use o instalador equivalente
do seu sistema, mantendo a versão 24.

```bash
# 2. Traz o código do projeto.
git clone https://github.com/rikelmesc08-lang/curriculo-pro-ia.git
cd curriculo-pro-ia
```

```bash
# 3. Instala as dependências exatamente como o lockfile define.
npm ci
```
Espera-se terminar sem erro, com uma pasta `node_modules` criada.

```bash
# 4. Cria o arquivo de segredos.
nano .env.local
```
Mesmo conteúdo da seção 5, sem `PORT` nem `HOSTNAME` — quem define as duas
aqui é `ecosystem.config.cjs`.

```bash
chmod 600 .env.local
```

```bash
# 5. Builda em modo standalone (o mesmo empacotamento que o Dockerfile usa,
#    só que fora de contêiner).
npm run build:standalone
```
Espera-se, no fim, a linha `[build-standalone] pronto. Suba com: npm run
start:standalone (ou pm2 start ecosystem.config.cjs)`.

```bash
# 6. Instala o PM2 globalmente.
npm install -g pm2
```

```bash
# 7. Carrega os segredos no ambiente do terminal ANTES de chamar o PM2 —
#    ecosystem.config.cjs não lê .env.local sozinho, de propósito (ele é
#    versionado no Git e não pode conter segredo).
export $(grep -v '^#' .env.local | xargs)
pm2 start ecosystem.config.cjs
```
Espera-se uma tabela do PM2 mostrando o processo `curriculo-pro-ia` com
status `online`.

```bash
# 8. Garante que o PM2 (e o app) sobem sozinhos se o VPS reiniciar.
pm2 save
pm2 startup
```
O comando `pm2 startup` imprime uma linha de comando para você copiar e
colar de volta no terminal (ele varia por sistema) — rode essa linha antes
de seguir.

```bash
# 9. Confirma que está de pé.
curl http://localhost:3000/api/saude
```
Espera-se `{"ok":true}`.

**Lembrete para o dia a dia:** se você trocar algo em `.env.local` depois,
`export` de novo o arquivo e rode `pm2 restart curriculo-pro-ia
--update-env` — sem o `--update-env`, o PM2 mantém as variáveis antigas na
memória.

### Atualizar o código depois do primeiro deploy

**O erro mais fácil de cometer aqui: reiniciar o processo sem antes gerar
um build novo.** `pm2 restart` e `docker compose restart` só derrubam e
sobem de novo o mesmo artefato que já estava rodando — nenhum dos dois lê
o código-fonte de novo. O sintoma é silencioso: o processo volta `online`,
`/api/saude` responde `{"ok":true}` normalmente, e o site continua
servindo a versão **antiga**, sem nenhum erro indicando isso.

**Caminho A (Docker) — sempre reconstrua a imagem antes de subir de novo:**
```bash
cd curriculo-pro-ia
git pull
docker compose up --build -d
```
`docker compose up --build` refaz a imagem a partir do código atual antes
de recriar o contêiner — é isto que garante que o build novo entrou.
`docker compose restart`, sozinho, **não** reconstrói nada.

**Caminho B (PM2) — sempre rode o build standalone antes de reiniciar:**
```bash
cd curriculo-pro-ia
git pull
npm ci
npm run build:standalone
pm2 restart curriculo-pro-ia
```
`npm run build:standalone` regenera `.next/standalone/server.js` — o
arquivo que `ecosystem.config.cjs` aponta como `script`. Rodar `pm2
restart` sem esse passo antes reinicia o mesmo `server.js` de antes,
compilado do código antigo. Se alguma variável de ambiente também mudou
neste deploy, use `pm2 restart curriculo-pro-ia --update-env` depois de
`export` o `.env.local` de novo (ver o lembrete acima).

Em qualquer um dos dois caminhos, confirme o deploy testando o
comportamento que você mudou — não só `/api/saude`, que responde
`{"ok":true}` tanto para o build novo quanto para o antigo.

---

## 3. Nginx como proxy reverso + HTTPS

O Next (dentro do Docker ou do PM2) só escuta na porta 3000, internamente.
Quem recebe a visita do navegador, faz HTTPS e encaminha para a porta 3000
é o Nginx.

**Ponto crítico deste passo:** o padrão de fábrica do Nginx aceita corpo de
requisição de até **1 MB**. Este projeto valida upload de foto/PDF até
`MAX_UPLOAD_BYTES` (8 MB, definido em `src/lib/files/limits.ts`) e permite
até `8.5mb` no corpo de uma Server Action (`bodySizeLimit`, em
`next.config.mjs`). Sem ajustar o Nginx, uma foto de currículo tirada no
celular recebe **413 Request Entity Too Large** do Nginx, antes de chegar
ao app e antes de qualquer mensagem nossa aparecer — o mesmo tipo de erro
sem explicação que este projeto já teve que corrigir uma vez do lado da
Vercel (ver o histórico em `src/lib/files/limits.ts`).

Este caminho (VPS + Nginx seu) é o **único** em que o teto do proxy é
responsabilidade sua. No caminho que está em produção hoje — Web App Node.js,
ver `deploy-web-app-nodejs.md` — o proxy é da Hostinger e foi medido passando
20 MB sem cortar.

```bash
# Instala o Nginx.
apt-get install -y nginx
```

Crie o arquivo de configuração do site:

```bash
nano /etc/nginx/sites-available/curriculoproia.online
```

Cole o conteúdo abaixo. Esta é a versão **antes** do certificado existir —
o Certbot (próximo passo) reescreve este mesmo arquivo para acrescentar o
bloco HTTPS sozinho.

```nginx
# /etc/nginx/sites-available/curriculoproia.online
#
# Proxy reverso: recebe a visita e repassa para o Next, que escuta só em
# 127.0.0.1:3000 (Docker publica a porta do contêiner nesse endereço;
# o PM2 sobe o server.js já ouvindo em 0.0.0.0:3000, alcançável do mesmo
# jeito).

server {
    listen 80;
    listen [::]:80;
    server_name curriculoproia.online www.curriculoproia.online;

    # TETO DE UPLOAD. O padrão do Nginx é 1m e cortaria a foto do
    # currículo com 413 antes do app sequer ser chamado. 10m fica acima do
    # bodySizeLimit do Next (8.5mb, em next.config.mjs), com a mesma folga
    # que o projeto já usa entre os próprios tetos internos.
    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Sem isto, o app vê toda requisição como se viesse do próprio
        # Nginx (127.0.0.1) e em http — o que faria src/proxy.ts tentar
        # redirecionar para https em loop, e os logs perderiam o IP de
        # quem realmente visitou.
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Ative o site e confira a sintaxe antes de recarregar:

```bash
ln -s /etc/nginx/sites-available/curriculoproia.online /etc/nginx/sites-enabled/
nginx -t
```
Espera-se `syntax is ok` e `test is successful`. Só então:
```bash
systemctl reload nginx
```

Neste ponto, visitar `http://SEU_IP_DO_VPS` ainda não funciona por nome de
domínio (o DNS ainda não foi mudado — seção 4) — mas já dá para confirmar
que o Nginx está encaminhando, testando de dentro do próprio VPS:
```bash
curl -H "Host: curriculoproia.online" http://localhost/api/saude
```
Espera-se `{"ok":true}`.

### Certificado HTTPS (Let's Encrypt / Certbot)

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d curriculoproia.online -d www.curriculoproia.online
```

O Certbot vai pedir um e-mail (para avisos de expiração) e perguntar se
quer redirecionar todo tráfego HTTP para HTTPS — **responda que sim**.
Espera-se, ao final, uma mensagem confirmando que o certificado foi obtido
e instalado, com a validade (90 dias). Ele reescreve
`/etc/nginx/sites-available/curriculoproia.online` sozinho, acrescentando
os caminhos do certificado e o redirecionamento — **isso é o resultado
correto**, não uma alteração manual esperada.

**Este passo só funciona depois de o domínio já apontar para o IP do VPS**
(seção 4) — o Certbot precisa conseguir alcançar seu servidor pelo nome
`curriculoproia.online` para validar que você é o dono.

### Renovação automática

O pacote `certbot` já instala um agendador (timer do systemd ou tarefa do
cron, dependendo da distribuição) que renova sozinho antes do vencimento.
Confirme que existe:
```bash
systemctl list-timers | grep certbot
```
Espera-se uma linha mostrando a próxima execução agendada. Para simular
uma renovação sem esperar 90 dias:
```bash
certbot renew --dry-run
```
Espera-se `Congratulations, all simulated renewals succeeded`.

---

## 4. Apontar o domínio

**Faça isto só depois de o VPS responder pelo IP dele**, testado nas
seções 2 e 3. Assim que este passo propagar, o site que hoje responde na
Vercel para de responder — não há como fazer os dois ao mesmo tempo com o
mesmo domínio.

1. No hPanel, vá até **Domínios** e selecione `curriculoproia.online`.
2. Procure a seção de **DNS** (pode aparecer como "DNS / Nameservers" ou
   "Editor de zona DNS").
3. Localize o registro **`A`** com nome `@` — hoje ele aponta para
   `216.198.79.1` (o endereço da Vercel). Edite o valor para o **IP do seu
   VPS**.
4. Confira também o registro de `www`: hoje ele redireciona (308) para o
   domínio principal, algo mantido pela própria Vercel. Configure um
   registro `A` (ou `CNAME` apontando para `curriculoproia.online`) para
   `www` também, com o mesmo IP do VPS — o bloco Nginx da seção 3 já
   responde por `www.curriculoproia.online` e redireciona para o apex
   (via a resposta do Certbot).
5. Salve. A propagação de DNS costuma levar de minutos a algumas horas;
   durante essa janela, alguns visitantes ainda podem cair no site antigo.

Depois que o domínio propagar, confirme com:
```bash
curl https://curriculoproia.online/api/saude
```
Espera-se `{"ok":true}` — se ainda vier a resposta da Vercel, o DNS ainda
não propagou por completo; aguarde e tente de novo.

---

## 5. Variáveis de ambiente em produção

Todas as variáveis abaixo vêm de `.env.example` e são lidas por
`src/lib/env.ts`. **Nenhum valor real está listado aqui** — só o que cada
uma faz e onde encontrar o valor.

**Onde cadastrar, nos dois caminhos:** um arquivo `.env.local` na raiz do
projeto no VPS (mesmo local em que ele foi criado nas seções 2). No
Caminho A, é `env_file` do `compose.yaml` que o lê; no Caminho B, é
carregado no ambiente do terminal antes de `pm2 start` (comentário em
`ecosystem.config.cjs`). Ele **nunca** é versionado — `.gitignore` já
recusa qualquer `.env*` exceto `.env.example` — e deve ficar com
`chmod 600`, legível só por quem faz o deploy.

| Variável | Para que serve | Obrigatória? | Onde encontrar o valor |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Liga a IA de verdade (Gemini). Sem ela o app entra em modo demonstração. | Recomendada | aistudio.google.com/apikey → "Create API key" |
| `GEMINI_MODEL` | Troca o modelo do Gemini usado. | Opcional (padrão `gemini-3.6-flash`) | Decisão sua |
| `AI_PROVIDER` | Força o provedor de IA (`gemini`, `anthropic` ou `demo`). | Opcional | Decisão sua |
| `ANTHROPIC_API_KEY` | Provedor alternativo de IA. | Opcional | console.anthropic.com |
| `ANTHROPIC_MODEL` | Modelo da Anthropic, se usada. | Opcional (padrão `claude-sonnet-5`) | Decisão sua |
| `AI_HOURLY_LIMIT` | Teto de chamadas de IA por usuário por hora. | Opcional (padrão 15) | Decisão sua |
| `AI_DAILY_LIMIT` | Teto de chamadas de IA por usuário por dia. | Opcional (padrão 40) | Decisão sua |
| `AI_CACHE_MINUTES` | Por quanto tempo a mesma pergunta reaproveita a resposta. | Opcional (padrão 720) | Decisão sua |
| `AI_PAYWALL` | Tranca a análise completa atrás do plano pago. | Opcional — ligue só depois de testar o checkout ponta a ponta (seção 6) | Decisão sua |
| `DB_DRIVER` | Escolhe o driver de banco (`local` ou `supabase`). | Opcional, mas em produção precisa resultar em `supabase` — `local` derruba o boot | Decisão sua (deixe em branco: com Supabase preenchido, o app já escolhe `supabase` sozinho) |
| `LOCAL_DATA_DIR` | Pasta do banco JSON do driver `local`. | Irrelevante em produção | — |
| `SUPABASE_URL` | Endereço do seu projeto Supabase. | **Obrigatória** | No painel do projeto Supabase, procure por uma seção chamada "Settings" (ou "Configurações") com uma subseção de "API" ou parecida — a interface muda com o tempo. Ali deve estar um campo com a URL do projeto |
| `SUPABASE_ANON_KEY` | Chave pública, usada pelo acesso normal com RLS. | **Obrigatória** | Mesma seção, num campo de chave rotulado algo como `anon` ou `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave que o webhook de pagamento usa para liberar o plano do usuário. | **Obrigatória se a cobrança for ligada** | Mesma seção, num campo de chave rotulado algo como `service_role` — costuma ficar atrás de um aviso ou de um botão para revelar, por ser mais sensível |
| `SESSION_SECRET` | Assina o cookie de sessão do driver `local`. | Opcional nesta configuração — só é lida dentro de `sign()`, em `src/lib/auth/session-cookie.ts:35-41`, chamada apenas pelas funções do driver `local`. Com `supabase` (o único driver válido em produção, e o que este guia configura), a sessão vem inteira do `@supabase/ssr` e essa função nunca é alcançada. Só importa se alguém ligar `DB_DRIVER=local` em produção — o que `assertDriverAllowed()` já bloqueia por outro caminho | Gere localmente, se quiser preenchê-la mesmo assim: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SITE_URL` | Endereço público do site, usado em link de e-mail, URL canônica e Open Graph. | **Obrigatória** (funcionalmente — sem ela tudo aponta para `localhost`) | Valor fixo: `https://curriculoproia.online` |
| `MERCADOPAGO_ACCESS_TOKEN` | Autentica as chamadas do app à API do Mercado Pago. | **Obrigatória para o checkout aparecer** | Painel Mercado Pago Developers → sua aplicação → Credenciais |
| `MERCADOPAGO_WEBHOOK_SECRET` | Prova que uma notificação veio mesmo do Mercado Pago. | **Obrigatória para o checkout aparecer** | Mesmo painel → Webhooks / Notificações (ver seção 6) |
| `CHECKOUT_PRICE_CENTS` | Preço cobrado, em centavos. | Opcional (padrão 2790 = R$ 27,90) | Decisão sua |

**`SUPABASE_SERVICE_ROLE_KEY` é a mais perigosa da lista.** Diferente de
`SUPABASE_ANON_KEY`, ela **ignora completamente a RLS** (a regra que
restringe cada usuário aos próprios dados) — é a exceção deliberada que só
o webhook de pagamento usa, porque ele não tem sessão de ninguém. Quem
tiver essa chave consegue ler ou alterar os dados de qualquer usuário
direto na API do Supabase, sem passar pelo app. Por isso ela mora só no
`.env.local` do servidor, com `chmod 600`, e nunca em variável com prefixo
`NEXT_PUBLIC_` nem em lugar nenhum que chegue ao navegador.

`PORT` e `HOSTNAME` **não entram** em `.env.local` — quem já as define é o
`Dockerfile` (Caminho A) ou o bloco `env` de `ecosystem.config.cjs`
(Caminho B).

---

## 6. Webhook do Mercado Pago em produção

No painel do Mercado Pago (<https://www.mercadopago.com.br/developers/panel>),
dentro da sua aplicação, vá em **Webhooks / Notificações** e cadastre:

- **URL:** `https://curriculoproia.online/api/pagamento/webhook`
- **Evento:** `Pagamentos` (`payment`)

Depois de salvar, copie o **segredo (assinatura secreta)** gerado ali e
cole em `MERCADOPAGO_WEBHOOK_SECRET`.

### Pontos críticos, já vistos acontecer neste projeto

**(a) Existem DUAS configurações separadas no painel — "Modo de teste" e
"Modo de produção" — e apontar só uma é um erro que já aconteceu aqui.**
A URL de webhook precisa ser cadastrada nas duas telas, com o segredo de
cada uma indo para a variável correspondente do ambiente que a usa (teste
para um ambiente de teste, produção para produção). Cadastrar só uma faz
notificações do outro modo chegarem sem assinatura reconhecível.

**(b) O segredo do webhook NÃO é o access token — são coisas diferentes.**
O access token autentica as chamadas que o *nosso* servidor faz à API do
Mercado Pago; o segredo do webhook prova que uma notificação recebida veio
mesmo deles. Trocar um pelo outro é o erro mais fácil de cometer, e o
efeito é o mesmo: toda notificação real é recusada.

**(c) Em experiências anteriores com esta conta, operações sensíveis no
painel pediram aprovação por QR no aplicativo do celular, com um token que
durava cerca de 5 minutos** — isto não está documentado em nenhum arquivo
deste repositório, e a interface do Mercado Pago pode ter mudado desde
então. Tenha o app do Mercado Pago à mão antes de mexer em credenciais ou
webhook por segurança; se aparecer um pedido de aprovação por QR, conclua-o
rápido, e se ele expirar no meio, repita a operação do zero. Se não
aparecer, siga em frente normalmente.

**(d) O simulador de notificações do painel NUNCA vai aparecer como
"entregue"**, porque ele usa um `id` de pagamento inventado, que não existe
de verdade na API do Mercado Pago — a consulta que o webhook faz sempre
volta 404 para esse id, e a rota responde 500 de propósito (para o Mercado
Pago reenviar, caso um dia seja um atraso real e não um id falso — ver
`docs/pagamento-mercado-pago.md`). **O sinal de sucesso não é o simulador
"passar" — é a AUSÊNCIA da linha `[webhook] assinatura recusada]` no log**
(seção 7). Se essa linha não aparecer, a verificação de assinatura, a
janela de tempo e o roteamento funcionaram; só a consulta ao pagamento
inventado falhou, como esperado.

Mantenha as credenciais de teste e de produção em variáveis/ambientes
separados — nunca misture token de teste com segredo de webhook de
produção, ou vice-versa. O passo a passo completo de teste (incluindo por
que o sandbox de token de teste não funciona nesta conta específica, e o
caminho alternativo que foi usado) está em
[`docs/pagamento-mercado-pago.md`](pagamento-mercado-pago.md) — o conteúdo
vale igual aqui, trocando só "Vercel" por "VPS na Hostinger" onde ele
falar de configurar variável de ambiente.

---

## 7. Ver o log quando der problema

**Caminho A (Docker):**
```bash
docker compose logs -f app
```
`-f` mantém acompanhando em tempo real; `Ctrl+C` para sair sem derrubar o
contêiner.

**Caminho B (PM2):**
```bash
pm2 logs curriculo-pro-ia
```

Em ambos, procure por linhas que começam com `[webhook]` — é o prefixo que
`src/app/api/pagamento/webhook/route.ts` usa em todo log de erro dessa
rota.

### As três mensagens mais prováveis quando um pagamento não libera

1. **`[webhook] MERCADOPAGO_WEBHOOK_SECRET ausente: notificação recusada`**
   A variável não está definida no `.env.local` do servidor (ou não foi
   recarregada — no Caminho B, lembre do `--update-env`). A rota responde
   503 e não processa nada. Confira a seção 5 e reinicie o processo depois
   de corrigir.

2. **`[webhook] assinatura recusada: <motivo>`**
   O segredo configurado em `MERCADOPAGO_WEBHOOK_SECRET` não bate com o
   que o Mercado Pago usou para assinar a notificação — geralmente porque
   o segredo de teste e o de produção foram trocados entre si (ver ponto
   (b) e (a) da seção 6), ou porque o webhook foi reconfigurado no painel e
   gerou um segredo novo sem atualizar o servidor. A rota responde 401 e
   nada é liberado.

3. **`[webhook] PaymentError: /v1/payments/<id> respondeu 404: <corpo>`**
   (o `console.error` do webhook imprime a exceção inteira — a linha real
   começa com o nome da classe, `PaymentError`, e termina com o corpo da
   resposta do Mercado Pago, montada em `src/services/payments/mercadopago.ts`;
   depois dela vêm as linhas de stack trace.) Durante um teste com o
   simulador do painel, isto é **esperado** — o
   `id` do simulador é inventado (ver ponto (d) da seção 6). Se aparecer
   para um pagamento **real**, o motivo mais provável é o
   `MERCADOPAGO_ACCESS_TOKEN` de um ambiente (teste) sendo usado para
   consultar um pagamento criado no outro (produção), ou vice-versa — cada
   token só enxerga os pagamentos do próprio modo.

Se nenhuma dessas linhas aparecer e o pagamento mesmo assim não libera,
confira também `[webhook] referência desconhecida: <ref>` (a notificação
aponta para uma linha que não existe na tabela `payments` — geralmente
sinal de banco errado, ex.: testando contra um Supabase e o token de
produção apontando para outro projeto) e `[webhook] valor insuficiente em
<id>` (o valor pago não bateu com `CHECKOUT_PRICE_CENTS` no momento da
compra).

---

## 8. Voltar atrás

Se a migração para a Hostinger falhar no meio do caminho, reverter para a
Vercel é rápido porque o projeto foi deixado pronto para isso de propósito:
**`vercel.json` continua no repositório**, sem ter sido apagado.

1. No painel da Vercel, confirme que o projeto ainda existe (ou reimporte
   o repositório `github.com/rikelmesc08-lang/curriculo-pro-ia`, se ele
   tiver sido removido).
2. Em **Settings → Environment Variables**, confirme que as mesmas
   variáveis da seção 5 deste guia ainda estão preenchidas lá (a Vercel
   guarda as suas próprias, separadas do `.env.local` do VPS).
3. No hPanel, volte o registro **`A` `@`** do DNS para `216.198.79.1` (o
   endereço da Vercel, o mesmo valor de antes desta migração).
4. Aguarde a propagação e confirme com
   `curl https://curriculoproia.online/api/saude` — espera-se `{"ok":true}`
   respondido pela Vercel de novo.

O VPS pode continuar ligado enquanto isso é investigado, já que o domínio
deixou de apontar para ele — não há necessidade de desligá-lo às pressas.

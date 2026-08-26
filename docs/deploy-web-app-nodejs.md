# Deploy na Hostinger (Web App Node.js) — o caminho que está no ar

Este é o caminho **em produção hoje**. O outro documento,
[`deploy-hostinger.md`](deploy-hostinger.md), ensina a subir o mesmo app num
VPS com Docker/PM2/Nginx — ele continua correto e testado, mas é **plano B**:
só vale se um dia o app passar dos limites do plano compartilhado, ou se a
Hostinger descontinuar o Web App Node.js.

Se você chegou aqui para resolver um site fora do ar, pule para a seção 9.

---

## 1. O que está no ar, verificado

Tudo nesta seção foi conferido por requisição real em **26/08/2026**, não
deduzido do código:

| Item | Valor |
| --- | --- |
| Produto | Hostinger **Web App Node.js** (plano de hospedagem compartilhada) |
| Endereço que responde | `https://deeppink-albatross-851735.hostingersite.com` |
| Origem do código | `github.com/rikelmesc08-lang/curriculo-pro-ia`, branch `main` |
| Gatilho do deploy | push no GitHub |
| Framework | Next.js 16.3.1, React 19.2.8 |
| Node esperado pelo projeto | 24 (`.nvmrc`) |
| CDN na frente | `hcdn`, da própria Hostinger (aparece em `Server:` e `x-hcdn-*`) |

**O domínio `curriculoproia.online` ainda responde pela Vercel** — e a decisão
já foi tomada: **ele vai para a Hostinger**. A seção 2 é o passo a passo dessa
virada. Enquanto ela não acontecer, existem dois deploys vivos do mesmo commit
e o endereço que as pessoas usam é o da Vercel.

---

## 2. Apontar o domínio para cá

Estado do DNS medido em **26/08/2026**:

| Registro | Valor hoje | Significa |
| --- | --- | --- |
| `NS` | `horizon.dns-parking.com`, `orbit.dns-parking.com` | **a zona já é da Hostinger** — edita no hPanel, sem trocar nameserver |
| `A @` | `216.198.79.1` | Vercel |
| `www` | `CNAME` → `curriculoproia.online` | segue o apex |

O subdomínio atual (`deeppink-albatross-851735.hostingersite.com`) é um `CNAME`
para `free.cdn.hstgr.net`, que resolve para `89.116.213.252` e
`147.79.105.164`. **Não copie esses IPs para o registro `A` do seu domínio.**
Eles são a entrada do CDN compartilhado; quem decide o alvo certo é o painel do
Web App, depois de o domínio ser cadastrado nele — e pode ser um `CNAME`, não
um `A`.

### ⚠️ A armadilha desta virada: HSTS já está gravado nos navegadores

`curriculoproia.online` **já serviu**
`Strict-Transport-Security: max-age=63072000; includeSubDomains` pela Vercel
(vem de `next.config.mjs`, e é intencional). Todo navegador que já visitou o
site guardou essa instrução por **dois anos**, e `includeSubDomains` estende
para `www`.

Consequência prática, e é séria: **se o DNS apontar para a Hostinger antes de o
certificado HTTPS estar válido lá, esses visitantes não veem um aviso — veem um
bloqueio.** O HSTS remove o botão "prosseguir mesmo assim". Não é possível
desfazer isso do lado do servidor: quem já tem a instrução gravada só sai dela
limpando o estado de segurança do navegador, ou esperando os dois anos.

Não há como eliminar a janela entre "DNS propagou" e "certificado emitido" —
a validação do certificado geralmente exige que o domínio já aponte para o novo
servidor. Dá para **encurtá-la**: TTL baixo antes da mudança, virada em horário
de pouco movimento, e o rollback pronto na mão (fim desta seção).

### A ordem, e o motivo de cada passo estar onde está

**Passo 0 — prove que a Hostinger atende gente de verdade, ainda no
subdomínio.** `/api/saude` responder `{"ok":true}` prova só que o processo Node
subiu; não prova Supabase, nem IA. **Faça um login real** em
`https://deeppink-albatross-851735.hostingersite.com/login`. Se o login
funciona, as credenciais do banco estão certas no painel. (Para isso o
subdomínio precisa estar nas *Redirect URLs* do Supabase — ver passo 5.)
Descobrir que faltava uma variável **depois** de virar o DNS é descobrir com o
site de produção fora.

**Passo 1 — troque `SITE_URL` para `https://curriculoproia.online` e implante,
ANTES de mexer no DNS.** Parece fora de ordem, mas não é: a variável só passa a
valer numa nova implantação, e você não quer esperar um build com o domínio já
vivo apontando para cá. Fazer antes é seguro porque o domínio ainda responde
pela Vercel — que roda o mesmo app, contra o mesmo Supabase —, então um link de
confirmação de e-mail gerado nessa janela continua funcionando. E evita a
janela contrária, pior: domínio já na Hostinger com `sitemap.xml` e URL
canônica ainda anunciando o subdomínio (`src/app/sitemap.ts` e
`src/app/robots.ts` leem `SITE_URL` **a cada requisição**, não no build).

Para implantar sem tocar no formulário de variáveis, use o commit vazio da
seção 4 — **nunca** o botão da seção 5.

**Passo 2 — cadastre o domínio no painel do Web App** (Domínios), tanto
`curriculoproia.online` quanto `www.curriculoproia.online`. Anote o alvo de DNS
que a tela indicar. É esse valor que vai para a zona, não os IPs do CDN.

**Passo 3 — baixe o TTL antes de editar.** No hPanel → Domínios →
`curriculoproia.online` → DNS. Deixe o TTL em **300** (a Hostinger recusa
valores abaixo de 60 na edição manual). Com TTL alto, um rollback leva horas em
vez de minutos.

**Passo 4 — edite a zona.** Troque o `A @` de `216.198.79.1` para o alvo do
passo 2. Mantenha o `www` acompanhando o apex, salvo se o painel pedir outra
coisa. Depois, **espere o certificado**. Só considere a virada concluída quando
isto responder:

```bash
curl -sI https://curriculoproia.online/api/saude | head -1
curl -s  https://curriculoproia.online/api/saude          # {"ok":true}
curl -sI https://curriculoproia.online/ | grep -i "^server:"   # espera-se hcdn
```

`Server: hcdn` é o que prova que quem respondeu foi a Hostinger, e não a Vercel
com DNS ainda em cache. **Não divulgue o endereço enquanto isso não fechar.**

**Passo 5 — Supabase.** No painel do projeto, em Authentication → URL
Configuration: ponha `https://curriculoproia.online` como *Site URL* e
acrescente-o às *Redirect URLs*. **Mantenha o subdomínio na lista durante a
transição** — remova só depois de tudo estabilizado. Sem isso, confirmação de
cadastro e recuperação de senha param, e o erro aparece para o usuário, não no
seu log.

**Passo 6 — Mercado Pago**, quando a cobrança for ligada. A URL do webhook
passa a ser `https://curriculoproia.online/api/pagamento/webhook`, cadastrada
nos **dois** modos do painel (teste e produção). Detalhes e a armadilha de host
errado em [`pagamento-mercado-pago.md`](pagamento-mercado-pago.md).

**Passo 7 — não apague o projeto da Vercel.** Ele é o rollback, e o custo de
mantê-lo parado é zero.

### Rollback

Voltar o `A @` para **`216.198.79.1`** no hPanel. Com TTL 300, o tráfego
retorna à Vercel em minutos, e o certificado de lá volta a valer — o que também
desarma o problema de HSTS descrito acima. Confirme com:

```bash
curl -sI https://curriculoproia.online/ | grep -i "^server:"   # espera-se Vercel
```

---

## 3. Como um deploy acontece

```bash
git push origin main
```

É isso. A Hostinger observa o repositório, baixa o commit novo, instala as
dependências, roda o build e reinicia o processo Node. Não há comando de
deploy, chave SSH nem upload de arquivo neste caminho.

**O build precisa ser o de webpack.** `npm run build` já carrega `--webpack`
por padrão neste projeto, e isso não é preferência: o servidor da Hostinger
tem glibc antigo, não carrega o SWC nativo e recusa o Turbopack com
*"Turbopack is not supported on this platform (linux/x64) because native
bindings are not available"*. O mesmo motivo obrigou
`scripts/build-standalone.mjs` a repetir a flag por conta própria — está
comentado lá.

`output: 'standalone'` **não** entra aqui. Ele só liga quando
`BUILD_STANDALONE=1` está no ambiente (ver `next.config.mjs`), o que é caso do
Docker e do caminho PM2 do VPS. O Web App Node.js roda o `next start` normal.

---

## 4. Quando o push não dispara a implantação

**Já aconteceu, no outro projeto Node desta mesma conta.** O GitHub aceita o
push, a Hostinger simplesmente não roda nada, e a lista de implantações segue
marcando o commit **anterior** como "Atual". Não há erro em lugar nenhum — o
sintoma é o site continuar servindo código velho.

Como confirmar, sem depender do painel:

```bash
# Os arquivos servidos mudaram depois do último commit de front-end?
curl -s https://deeppink-albatross-851735.hostingersite.com/ \
  | grep -o "static/chunks/[a-z0-9-]*\.js" | sort -u | head
```

Se os nomes não mudaram depois de um commit que mexeu no front, o build não
rodou. A saída é forçar um commit novo, porque o gatilho é o commit e não o
conteúdo dele:

```bash
git commit --allow-empty -m "chore: forca nova implantacao na Hostinger"
git push origin main
```

---

## 5. O botão que não se aperta

**Não use "Reimplantar" no painel.** Ele leva a *"Configurações e
reimplantação"*, cuja única ação disponível é **"Salvar e reimplantar"** — e
isso grava o formulário inteiro de volta, incluindo as variáveis de ambiente,
que a tela exibe **truncadas**. Se o salvamento gravar o que está visível em
vez do valor completo, você derruba as credenciais de produção inteiras de uma
vez, e o site volta sem banco, sem IA e sem pagamento.

O commit vazio da seção 4 faz o mesmo trabalho sem tocar nas variáveis.

---

## 6. Variáveis de ambiente

Neste caminho **não existe `.env.local`**: as variáveis vivem no painel do Web
App. A lista completa, com o que cada uma faz e onde achar o valor, está na
seção 5 de [`deploy-hostinger.md`](deploy-hostinger.md) e em `.env.example` —
não vale duplicar aqui, porque duas listas divergem com o tempo.

Três avisos que são específicos **deste** caminho:

**(a) Nada com prefixo `VERCEL_` pode ser copiado para cá.** `VERCEL_ENV`,
`VERCEL_URL` e `VERCEL_BRANCH_URL` moram no mesmo painel da Vercel que guarda
as outras credenciais, e é fácil migrar tudo "porque estava junto". Elas não
são credencial nenhuma: `src/lib/env.ts` as usa só para o preview da Vercel se
apontar para si mesmo. Com `VERCEL_ENV=preview` presente aqui, `siteUrl()`
passa a resolver para um domínio `*.vercel.app` morto — **sem nenhum erro em
log**. Alguém se cadastra, o e-mail de confirmação chega apontando para o
domínio morto, e a conta nunca é confirmada.

**(b) `SITE_URL` tem que ser o endereço que realmente atende.** Em 26/08/2026
ela estava correta apontando para o subdomínio — verificado pela imagem de Open
Graph, servida como
`https://deeppink-albatross-851735.hostingersite.com/opengraph-image`. **Com a
virada do domínio ela passa a ser `https://curriculoproia.online`**, no passo 1
da seção 2. Ela não é lida só na navegação: `src/app/robots.ts` e
`src/app/sitemap.ts` a consultam a cada requisição, então um valor velho
publica sitemap apontando para o lugar errado sem nada acusar no build.

**(c) `PORT` e `HOSTNAME` são do ambiente, não suas.** Quem define é a
plataforma. No VPS, quem define é o `Dockerfile` ou o `ecosystem.config.cjs`;
aqui, é o Web App. Não cadastre à mão.

---

## 7. O que o hcdn faz com os seus cabeçalhos

A CDN da Hostinger fica na frente do Node e **reescreve a
`Content-Security-Policy`**: o que o app manda é substituído por
`upgrade-insecure-requests`, e só. A política inteira — nonce,
`strict-dynamic`, `object-src` — some no caminho.

Por isso o app entrega a CSP **duas vezes**: no cabeçalho (que o hcdn apaga) e
num `<meta http-equiv>` dentro do HTML (que ele deixa passar, porque não
reescreve corpo). Quem monta é `src/lib/seguranca/csp.ts`; quem entrega são
`src/proxy.ts` e `src/app/layout.tsx`.

**Medido em 26/08/2026, em produção:**

- cabeçalho recebido: `content-security-policy: upgrade-insecure-requests` (reescrito, como esperado)
- `<meta>` no HTML: política completa, intacta
- 14 de 14 `<script>` da home com `nonce`, **zero** sem
- o nonce do `<meta>` e o dos scripts são idênticos dentro da mesma resposta

Todos os **outros** cabeçalhos de segurança de `next.config.mjs` chegam
inteiros — conferidos um a um contra a Vercel, e idênticos nos dois:
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, `Strict-Transport-Security`,
`X-Content-Type-Options`, `X-Frame-Options`. `X-Powered-By` está ausente nos
dois, como `poweredByHeader: false` pede. **O hcdn mexe só na CSP.**

> **Não testado:** o teto de tamanho de corpo do hcdn. No VPS o gargalo é o
> `client_max_body_size` do Nginx (padrão de fábrica 1 MB, armadilha
> documentada em `next.config.mjs`); aqui não há Nginx seu, e não se sabe onde
> a Hostinger corta. A importação de currículo por foto aceita até 4 MB
> (`src/lib/files/limits.ts`). **Antes de anunciar a importação por foto,
> envie uma foto real de ~3 MB pela tela `/app/curriculo/importar` e veja se
> ela passa** — se voltar 413, o corte é da CDN e não tem correção no código.

---

## 8. Verificar um deploy em um minuto

```bash
BASE=https://deeppink-albatross-851735.hostingersite.com   # ou o domínio, depois da virada

# 1. O processo está de pé?
curl -s $BASE/api/saude            # espera-se {"ok":true}

# 2. As rotas respondem, e o 404 é 404?
for r in / /login /cadastro /termos /app /app/upgrade /rota-que-nao-existe; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' -L $BASE$r)  $r"
done
# espera-se 200 em tudo, menos 404 na última

# 3. A CSP sobreviveu ao hcdn?
curl -s $BASE/ | grep -c 'http-equiv="Content-Security-Policy"'   # espera-se 1

# 4. Algum <script> ficou sem nonce?
curl -s $BASE/ | grep -oE '<script[^>]*>' | grep -cv 'nonce='     # espera-se 0

# 5. Quem respondeu? (útil durante a virada de DNS)
curl -sI $BASE/ | grep -i "^server:"                              # hcdn = Hostinger
```

`/app` e `/app/upgrade` respondem 200 **depois de redirecionar** para
`/login?proximo=...` quando não há sessão — isso é o comportamento certo, não
uma falha do teste.

---

## 9. Quando dá errado

**O site responde 500, ou não responde.**
Abra os logs de execução no painel do Web App (é o equivalente ao
`docker compose logs` / `pm2 logs` do VPS). Procure linhas com prefixo
`[webhook]` para problemas de pagamento — a lista das mensagens mais prováveis
e o que cada uma significa está na seção 7 de
[`deploy-hostinger.md`](deploy-hostinger.md), e vale igual aqui, porque é log
do app e não da plataforma.

**O navegador recusa a conexão e não deixa prosseguir.**
É o HSTS da seção 2, e quer dizer que o certificado do domínio não está válido
na Hostinger. Não adianta insistir nem pedir para o visitante contornar. O
caminho é o rollback de DNS da seção 2 — que devolve o tráfego para a Vercel e
o certificado válido de lá — e refazer a virada depois de o certificado sair.

**O build quebrou e o site anterior caiu junto.**
Volte o código, não o painel — o gatilho é o commit:

```bash
git revert --no-edit HEAD    # desfaz o commit ruim criando um novo
git push origin main         # dispara a implantação do estado bom
```

`git reset --hard` seguido de push forçado chegaria no mesmo lugar, mas
reescreve histórico já compartilhado; o `revert` deixa rastro do que houve.

**As credenciais sumiram** (site no ar, mas sem banco, sem IA ou sem pagamento,
ou e-mails apontando para o lugar errado).
Provavelmente foi o "Salvar e reimplantar" da seção 5. Recadastre uma a uma,
pela seção 5 de [`deploy-hostinger.md`](deploy-hostinger.md), tirando os
valores da fonte original (Supabase, Google AI Studio, Mercado Pago) — **não**
do que estiver truncado na tela.

**Nada disso resolveu: voltar para a Vercel.**
Este é o caminho de fuga mais curto que existe, e é curto de propósito:
`vercel.json` continua no repositório e o projeto lá continua de pé. Reverter é
devolver o registro `A` `@` para `216.198.79.1` no hPanel e esperar a
propagação (seção 2). O Web App pode continuar ligado durante a investigação —
sem o domínio apontando para ele, ninguém cai lá por acidente.

---

## 10. O que este caminho não resolve

- **Limite do plano compartilhado.** CPU e memória são divididos com outras
  contas. Não há medição feita deste app sob carga real; se um dia o site ficar
  lento sem causa no código, o teto do plano é suspeito legítimo — e a resposta
  é o VPS de [`deploy-hostinger.md`](deploy-hostinger.md).
- **Controle do que fica na frente do Node.** O hcdn é da Hostinger. Você não
  configura `client_max_body_size`, não escolhe o que ele reescreve, e a CSP
  por `<meta>` existe justamente porque não há como pedir para ele parar.
- **Rollback por painel.** O histórico de implantações mostra o que rodou, mas
  o caminho confiável de voltar é o `git revert` da seção 9.

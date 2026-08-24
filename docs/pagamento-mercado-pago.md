# Ligar a cobrança (Mercado Pago)

O código do checkout está pronto e desligado. Ele só aparece na tela quando as
credenciais existem — sem elas, a tela de plano diz que a cobrança não está
ativa, em vez de mostrar um botão que falha depois do clique.

Este documento é a lista do que **não é código**. Pular qualquer passo daqui
produz o mesmo desfecho: alguém paga e não recebe o acesso.

---

## Antes de qualquer coisa: dois bloqueios

**1. O plano Hobby da Vercel é não-comercial.** Cobrar por um produto hospedado
nele viola os termos de uso. Para vender de verdade, é preciso o plano Pro
(US$ 20/mês). Isso não é uma recomendação técnica — é a regra da plataforma.

**2. A migração do banco precisa rodar.** O bloco `COBRANÇA` no fim de
`docs/schema.sql` cria a tabela `payments` **e corrige uma falha de segurança
que existe hoje**: a permissão de update do perfil não restringia coluna, então
um usuário logado podia escrever `plan = 'pro'` em si mesmo chamando o Supabase
direto com o próprio token.

Ninguém explorou porque não havia o que explorar — nada cobrava. Mas o buraco
vira prejuízo exatamente no dia em que a cobrança entra no ar.

**Rode o bloco `COBRANÇA` inteiro no editor SQL do Supabase antes de preencher
qualquer variável.** Ele é idempotente: pode rodar mais de uma vez.

> ✅ **Feito em 24/08/2026.** Conferido depois no catálogo do Postgres: as
> colunas de `profiles` que `authenticated` pode escrever passaram a ser
> **só `name`**, `payments` nasceu com RLS ligada, e `anon` não tem privilégio
> nenhum. Na mesma passada foi acrescentado o bloco `SOBRAS DO PADRÃO DO
> SUPABASE`, que revoga `TRUNCATE`, `REFERENCES` e `TRIGGER` das cinco tabelas —
> **`TRUNCATE` ignora RLS**, e vinha por padrão do Supabase sem ninguém pedir.

---

## Passo a passo

### 1. Conta e aplicação no Mercado Pago

Você precisa fazer isto — eu não crio conta nem manuseio credencial.

1. Entre em <https://www.mercadopago.com.br/developers/panel>
2. Crie uma aplicação (tipo: pagamentos online, Checkout Pro)
3. Anote o **Access Token**. Há dois: o de **teste** e o de **produção**

Comece pelo de teste. O de produção cobra dinheiro de verdade no primeiro
clique.

### 2. Webhook

Ainda no painel da aplicação, em **Webhooks / Notificações**:

- **URL:** `https://curriculoproia.online/api/pagamento/webhook`
- **Evento:** `Pagamentos` (`payment`)
- Salve e **copie o segredo (assinatura secreta)** que ele gera

O segredo **não é** o access token. São coisas diferentes:

| | para que serve |
| --- | --- |
| Access token | autentica as **nossas** chamadas à API deles |
| Segredo do webhook | prova que uma notificação **veio deles** |

Sem o segredo, o webhook recusa tudo. É deliberado: a URL não é secreta —
aparece no painel, em log de borda e em histórico de navegador. Sem verificar a
assinatura, qualquer POST viraria um "pagamento aprovado".

### 3. Variáveis na Vercel

Em **Settings → Environment Variables**, todas como *Sensitive*:

```
MERCADOPAGO_ACCESS_TOKEN     = <access token>
MERCADOPAGO_WEBHOOK_SECRET   = <segredo do webhook>
SUPABASE_SERVICE_ROLE_KEY    = <chave service_role do Supabase>
```

A `service_role` passa a ser obrigatória agora. O webhook não tem sessão de
usuário — quem o chama é o Mercado Pago — e precisa marcar a compra e liberar o
plano de alguém sem estar autenticado como essa pessoa.

Opcional: `CHECKOUT_PRICE_CENTS` (padrão `2790`, ou seja R$ 27,90). É **em
centavos, inteiro**. Dinheiro não circula como decimal neste projeto: `27.90`
não existe em ponto flutuante binário, e o centavo que some só aparece na
conciliação, meses depois.

**As variáveis só valem no próximo deploy.**

### 4. Testar antes de ligar de verdade

> ⚠️ **NESTA CONTA O TESTE COM TOKEN DE TESTE É IMPOSSÍVEL.** Descoberto em
> 24/08/2026: a conta já criou as **15 contas de teste** que o Mercado Pago
> permite, e a documentação deles é explícita — *"it is not yet possible to
> delete them"*. Não há botão nem endpoint, e elas não expiram. O teto é **da
> conta**, não da aplicação: uma aplicação recém-criada já nasce com ele
> estourado.
>
> Sintoma: "Ativar credenciais de teste" falha sempre com o genérico
> `DXT40-...`. A causa real só aparece no console do navegador —
> `[CredentialsActivateUser][ERROR] ... userId: undefined ... 422`. A ativação
> tenta CRIAR contas de teste e esbarra no teto.
>
> **O caminho que sobrou, e que funcionou:**
>
> 1. **Simulador de notificações do painel** (Webhooks → Configurar
>    notificações → Simular notificação). Ele manda uma notificação **assinada
>    de verdade** contra a nossa URL, sem pagamento e sem conta de teste.
>    Valida a parte perigosa: assinatura HMAC, janela de tempo, roteamento.
> 2. **Credenciais de produção escopadas SÓ no ambiente Preview da Vercel**,
>    com o webhook apontando para o preview. Produção fica sem as variáveis e
>    sem a rota — o botão de compra não aparece no site.
> 3. **Um pagamento real de valor baixo** (PIX pelo app do banco) para o pedaço
>    que nenhuma simulação cobre.
>
> Se um dia precisar do sandbox de verdade, o caminho é outra conta Mercado
> Pago ou o suporte deles liberando a cota.

Com o token de **teste**:

1. Crie um usuário de teste no painel do Mercado Pago (comprador)
2. Faça uma compra completa no site
3. Confira, nesta ordem:
   - a linha apareceu em `payments` no Supabase com status `pendente`
   - depois do pagamento, o status virou `pago`
   - o `plan` do perfil virou `pro`
   - a tela `/app/upgrade` mostra "Completo"

Se o status ficar preso em `pendente`, o problema é o webhook: veja os logs da
função na Vercel. `[webhook] assinatura recusada` significa segredo errado.

### 5. Ligar o paywall

Só depois de o teste passar ponta a ponta:

```
AI_PAYWALL=on
```

Esta é a chave que tranca a análise completa atrás do plano pago. Enquanto ela
estiver desligada, o checkout funciona mas ninguém tem motivo para usá-lo — tudo
continua aberto.

**Avise quem já usa o produto antes de ligar.** A tela promete isso hoje.

---

## O que o código faz para proteger o dinheiro

Não é preciso confiar na descrição — está tudo em teste, e os testes estão
escritos para falhar de verdade.

**A assinatura é verificada antes de tudo** (`mercadopago-signature.ts`, 15
testes). Comparação em tempo constante, janela de 15 minutos nos dois sentidos
para reenvio capturado não valer para sempre, e recusa quando o `data.id` foi
trocado depois de assinar.

**O corpo da notificação não é fonte de verdade.** Ele diz "olhe o pagamento X";
quem diz se X foi aprovado é uma resposta autenticada da API do provedor.

**O valor é conferido na volta.** Pagamento menor que o cobrado não libera nada,
mesmo com assinatura válida.

**Notificação repetida não faz nada duas vezes,** e notificação fora de ordem
não rebaixa compra paga: `podeTransicionar` só deixa `pago` virar `estornado`.

**Estorno devolve ao plano gratuito.** O acesso segue o dinheiro nos dois
sentidos.

**Nenhum dado de cartão passa por este servidor.** O Checkout Pro é hospedado —
a pessoa digita o cartão no domínio do Mercado Pago.

---

## O 404 responde 500, e isso é deliberado

Rodar o simulador do painel devolve **`500 - Internal Server Error`**, e o log
mostra o porquê:

```
[webhook] PaymentError: /v1/payments/123456 respondeu 404: <corpo da resposta do Mercado Pago>
```

**Isso não é defeito — é o teste passando.** O simulador inventa o id `123456`,
que não existe. O importante é o que o log NÃO tem: nenhuma linha
`[webhook] assinatura recusada`. A notificação atravessou a verificação de
assinatura, a janela de tempo e o reconhecimento do tipo, e só parou porque a
API do provedor — consultada com autenticação válida — disse que o pagamento
não existe.

**Não espere o simulador "passar".** Com um id inventado ele sempre vai falhar,
e a métrica "Notificações entregues" do painel fica em 0%.

### Por que qualquer falha de consulta vira 500

`webhook/route.ts` responde 500 para toda exceção ao consultar o pagamento,
inclusive um 404. O efeito é que o Mercado Pago reenvia.

Isso é escolha, não descuido. **O Mercado Pago às vezes notifica um pagamento
antes de ele ficar legível na API dele.** Nesse caso o 404 é temporário. Tratar
404 como definitivo e responder 200 faria o provedor parar de reenviar — e a
compra de alguém que pagou de verdade ficaria pendente para sempre, sem nenhum
evento futuro para corrigi-la.

O custo de errar para este lado é reenvio inútil de notificação que não é nossa.
O custo de errar para o outro lado é o dinheiro de uma pessoa sumir. **Enquanto
os dois não puderem ser distinguidos com segurança, o conservador é este.**

Se um dia valer distinguir: a saída não é olhar só o 404, é olhar o 404 JUNTO
com a idade da notificação (`date_created`). Notificação antiga com 404 é
definitiva; notificação de segundos atrás com 404 é atraso de consistência.

---

## Voltar atrás

Apague `MERCADOPAGO_ACCESS_TOKEN` das variáveis e faça um deploy. O checkout
some da tela e volta a mensagem de "cobrança não está ativa". Quem já pagou
continua com `plan = 'pro'` — a coluna não é tocada por isso.

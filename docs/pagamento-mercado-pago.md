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

## Voltar atrás

Apague `MERCADOPAGO_ACCESS_TOKEN` das variáveis e faça um deploy. O checkout
some da tela e volta a mensagem de "cobrança não está ativa". Quem já pagou
continua com `plan = 'pro'` — a coluna não é tocada por isso.

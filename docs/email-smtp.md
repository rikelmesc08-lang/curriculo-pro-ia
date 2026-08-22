# E-mail transacional (SMTP)

Este documento existe porque **o cadastro do produto não funciona sem ele**.

## O problema

O Supabase manda os e-mails de autenticação por um servidor próprio, que é
declaradamente de desenvolvimento. No painel, em *Authentication → Rate Limits*,
o campo fica assim:

```
Rate limit for sending emails    2  emails/h     (campo desabilitado)
```

**Dois e-mails por hora, para o projeto inteiro.** A terceira pessoa que se
cadastrar numa hora não recebe nada: sem confirmação ela não entra, e o botão de
reenviar consome a mesma cota esgotada. O campo não é editável — é o teto fixo
do servidor embutido.

Há um segundo efeito, menor mas visível: enquanto não houver SMTP próprio, o
painel **não deixa editar os modelos de e-mail**. Todo mundo recebe o texto
padrão do Supabase, em inglês, sem identidade nenhuma:

> *Confirm your signup — Follow this link to confirm your user*

## Domínio próprio não é opcional

Desde 2024, Gmail, Yahoo e Microsoft exigem autenticação (SPF, DKIM, DMARC) de
quem envia e-mail em volume, e **rejeitam ou mandam para spam** mensagens
disparadas a partir de endereço de provedor gratuito.

Na prática: dá para verificar um `@gmail.com` como remetente na Brevo, o envio
"funciona", e o e-mail de confirmação cai na caixa de spam de quem se cadastrou
— exatamente a falha que o SMTP deveria consertar, agora sem nem aparecer nos
logs. Um domínio próprio, com os registros DNS que o provedor pede, é o que
resolve.

## Qual provedor

Números conferidos em agosto de 2026 — confira antes de decidir, isto muda.

| | Gratuito | Limite diário | Observação |
|---|---|---|---|
| **Resend** | 3.000/mês | 100/dia | 1 domínio verificado; configuração mais simples |
| **Brevo** | ~9.000/mês | 300/dia | gratuito permanente, mais folga |
| **Amazon SES** | 3.000/mês | — | só no primeiro ano; exige sair do *sandbox* |
| **SendGrid** | — | — | encerrou o plano gratuito em 2025; hoje só teste de 60 dias |

**Recomendação: Resend.** Para um produto lançando, 100 e-mails por dia é muito
mais do que o necessário — cada cadastro gasta um — e a verificação de domínio
é a mais direta das quatro. Se o volume passar disso, Brevo dá o triplo de
margem no gratuito, e o Resend Pro começa em US$ 20/mês.

## Passo a passo

1. **Registrar o domínio**, se ainda não houver.

2. **Criar a conta no provedor e verificar o domínio.** Ele vai pedir alguns
   registros DNS (SPF, DKIM, às vezes DMARC). A propagação costuma levar de
   minutos a algumas horas.

3. **Gerar as credenciais SMTP** no painel do provedor.

4. **No Supabase**, em *Authentication → Emails → SMTP Settings*, ligar
   **Enable custom SMTP** e preencher:

   | Campo | O que é |
   |---|---|
   | Sender email | o remetente, ex. `nao-responda@seudominio.com.br` |
   | Sender name | `CurrículoPro IA` |
   | Host | servidor do provedor |
   | Port number | normalmente `587` |
   | Username | usuário SMTP do provedor |
   | Password | senha ou chave de API |

   O remetente precisa estar no domínio verificado no passo 2. Um remetente
   fora dele derruba a autenticação e o e-mail volta para o spam.

5. **AJUSTAR O LIMITE — este passo é fácil de esquecer e anula os anteriores.**
   Ligar o SMTP não libera o envio: o Supabase passa o limite para **30/hora**,
   e não para o do seu provedor. A diferença é que agora o campo em
   *Authentication → Rate Limits* fica **editável**. Suba para um valor
   compatível com o plano contratado.

6. **Colar os modelos em português.** Com o SMTP ligado, *Authentication →
   Emails → Templates* libera assunto e corpo. Os arquivos estão em
   [`docs/emails/`](./emails/), com o assunto sugerido no comentário do topo:

   - `confirmar-cadastro.html` → *Confirm sign up*
   - `recuperar-senha.html` → *Reset password*

   **Não troque `{{ .ConfirmationURL }}` por uma URL montada à mão.** Essa
   variável aponta para o endpoint de verificação do Supabase, que valida o
   código e só então redireciona para `/auth/confirmar` ou `/auth/recuperar`.
   Uma URL construída manualmente pula a validação e o link para de funcionar.

## Como saber se funcionou

Cadastre-se com um endereço real e confira, nesta ordem:

1. o e-mail **chegou** — se não chegou, o problema é credencial ou limite;
2. chegou **na caixa de entrada**, e não no spam — se caiu no spam, o problema
   é DNS: SPF/DKIM/DMARC do domínio;
3. veio **em português**, com o remetente certo — se veio em inglês, os modelos
   não foram salvos;
4. o link **abre o site e entra direto** — se abrir o lugar errado, o problema é
   `SITE_URL` ou a lista de *Redirect URLs* (ver o README).

Vale repetir o teste depois com **recuperação de senha**, que usa o outro modelo
e o outro caminho de volta.

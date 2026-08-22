'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getRepository } from '@/lib/db';
import { createSupabaseServerClient } from '@/lib/db/supabase/client';
import { env } from '@/lib/env';
import { formError, formSuccess, text, type FormState } from '@/lib/forms/state';
import { destinoOuPadrao } from './destino';
import { authenticateLocalUser, changeLocalPassword, createLocalUser } from './local';
import { consumeLocalPasswordReset, createLocalPasswordReset } from './reset';
import { createLocalSessionValue, getSessionUser, sessionCookie } from './session';
import { limparLimite, mensagemDeLimite, verificarLimite } from './throttle';
import {
  emailSchema,
  fieldErrorsFrom,
  normalizeEmail,
  passwordSchema,
  signInSchema,
  signUpSchema,
} from './validation';

/**
 * Ações de autenticação.
 *
 * ESTE ARQUIVO SÓ EXPORTA FUNÇÃO ASYNC. Um `export const` aqui passa por tsc,
 * lint e build sem reclamar, e só estoura no clique real do usuário — a
 * diretiva `"use server"` transforma cada export num endpoint, e endpoint que
 * não é função não existe. Tipos e helpers moram em `@/lib/forms/state`.
 */

/** Destino seguro pós-login: só caminho interno, nunca URL absoluta. */

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Limite por IP no cadastro: sem ele, um script cria contas em série para
  // consumir cota de IA, poluir a base ou usar o envio de e-mail do provedor
  // como amplificador.
  const limiteIp = await verificarLimite('cadastroPorIp');
  if (!limiteIp.permitido) return formError(mensagemDeLimite(limiteIp.esperarSegundos));

  const parsed = signUpSchema.safeParse({
    name: text(formData, 'name'),
    email: text(formData, 'email'),
    password: text(formData, 'password'),
  });

  if (!parsed.success) {
    return formError('Confira os campos destacados.', fieldErrorsFrom(parsed.error));
  }

  const { name, email, password } = parsed.data;
  const next = destinoOuPadrao(text(formData, 'proximo'));

  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    const { data, error } = await client.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        data: { name },
        // SEM ISTO O CADASTRO QUEBRA EM PRODUÇÃO. O Supabase precisa saber para
        // onde mandar quem clica no link de confirmação; quando não recebe
        // `emailRedirectTo`, ele usa o campo "Site URL" do painel — que nasce
        // como `http://localhost:3000` e mandava todo mundo para a própria
        // máquina. O destino do app tem que sair do app, não de uma
        // configuração distante que ninguém revisa.
        emailRedirectTo: `${env.siteUrl()}/auth/confirmar`,
      },
    });

    if (error) {
      return formError(
        error.message.toLowerCase().includes('already')
          ? 'Já existe uma conta com este e-mail. Tente entrar.'
          : 'Não conseguimos criar sua conta agora. Tente de novo em instantes.'
      );
    }

    // Projeto com confirmação de e-mail ligada devolve usuário sem sessão. Dizer
    // "conta criada, agora entre" seria mentira: a pessoa ainda precisa clicar
    // no link do e-mail.
    if (!data.session) {
      return formSuccess(
        'Conta criada. Confirme seu e-mail pelo link que enviamos para entrar.',
        'confirmacao-pendente'
      );
    }
  } else {
    const result = await createLocalUser({ name, email, password });
    if (!result.ok) {
      return formError('Já existe uma conta com este e-mail. Tente entrar.', {
        email: 'E-mail já cadastrado.',
      });
    }

    const session = createLocalSessionValue(result.user.id);
    const store = await cookies();
    store.set(sessionCookie.name, session.value, sessionCookie.options(session.expiresAt));
  }

  redirect(next);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: text(formData, 'email'),
    password: text(formData, 'password'),
  });

  if (!parsed.success) {
    return formError('Confira os campos destacados.', fieldErrorsFrom(parsed.error));
  }

  const { email, password } = parsed.data;
  const next = destinoOuPadrao(text(formData, 'proximo'));

  // FORÇA BRUTA E CREDENTIAL STUFFING. Sem limite, esta ação é um oráculo de
  // senha com a velocidade da rede — e listas de e-mail e senha vazadas de
  // outros serviços são testadas em massa exatamente assim.
  //
  // Dois eixos porque cada um cobre um ataque: por e-mail segura a força
  // bruta contra UMA conta; por IP segura a varredura de MUITAS contas.
  const limiteIp = await verificarLimite('loginPorIp');
  if (!limiteIp.permitido) return formError(mensagemDeLimite(limiteIp.esperarSegundos));

  const limiteEmail = await verificarLimite('loginPorEmail', email);
  if (!limiteEmail.permitido) return formError(mensagemDeLimite(limiteEmail.esperarSegundos));

  // A mensagem de erro é a mesma para e-mail inexistente e senha errada, nos
  // dois drivers. Diferenciar entregaria de graça a lista de quem tem conta.
  const invalid = 'E-mail ou senha incorretos.';

  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    const { error } = await client.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });

    // E-MAIL NÃO CONFIRMADO É OUTRO PROBLEMA, e esconder isso atrás da mensagem
    // genérica prende a pessoa num laço: ela tem a senha certa, ouve que está
    // errada, vai redefinir a senha — e continua sem entrar, porque a senha
    // nunca foi o problema. Não há saída possível a partir daí.
    //
    // Sobre revelar que a conta existe: o cadastro JÁ responde "Já existe uma
    // conta com este e-mail" para qualquer endereço testado, então esta
    // mensagem não abre nenhuma porta que o cadastro não tenha aberto antes.
    // Trocar uma pessoa presa por um oráculo que já existe é mau negócio.
    if (error?.code === 'email_not_confirmed') {
      return formError(
        'Sua conta ainda não foi confirmada. Confira o link que enviamos por e-mail.',
        undefined,
        'email-nao-confirmado'
      );
    }

    if (error) return formError(invalid);
  } else {
    const result = await authenticateLocalUser({ email, password });
    if (!result.ok) return formError(invalid);

    const session = createLocalSessionValue(result.user.id);
    const store = await cookies();
    store.set(sessionCookie.name, session.value, sessionCookie.options(session.expiresAt));
  }

  // Entrou: o contador daquele e-mail volta a zero. Sem isto, quem erra a
  // senha quatro vezes, acerta na quinta e volta minutos depois encontraria
  // a própria conta bloqueada por um ataque que não houve.
  limparLimite('loginPorEmail', email);

  redirect(next);
}

/**
 * Reenvia o e-mail de confirmação do cadastro.
 *
 * Sem esta tela o cadastro tem um beco sem saída, e ele é fácil de alcançar: o
 * link do e-mail vale uma vez e expira, e-mail de confirmação cai em spam com
 * frequência, e caixas de entrada são apagadas sem cerimônia. Quem perde o link
 * não consegue entrar (a conta não está confirmada), não consegue se cadastrar
 * de novo ("e-mail já em uso") e não resolve nada redefinindo a senha — a senha
 * nunca foi o problema. A conta fica inacessível para sempre.
 *
 * As mesmas duas defesas da recuperação de senha, pelas mesmas razões:
 *
 *   - LIMITE ANTES DE QUALQUER COISA, porque esta ação faz um servidor de
 *     e-mail disparar mensagem para um endereço que ninguém precisa provar que
 *     é seu — matéria-prima de inundação de caixa de entrada, com este produto
 *     no campo do remetente;
 *   - RESPOSTA SEMPRE IGUAL, para a tela não virar verificador de cadastro.
 *     Vale inclusive quando o Supabase recusa porque a conta já está
 *     confirmada: dizer isso entregaria o estado da conta de quem quer que
 *     seja.
 */
export async function resendConfirmationAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const limiteIp = await verificarLimite('confirmacaoPorIp');
  if (!limiteIp.permitido) return formError(mensagemDeLimite(limiteIp.esperarSegundos));

  const parsed = emailSchema.safeParse(text(formData, 'email'));

  // Formato pode falar: "joao@" não é conta de ninguém, e sem este aviso a
  // pessoa fica esperando um e-mail que nunca foi endereçado a lugar nenhum.
  if (!parsed.success) {
    return formError('Confira o e-mail digitado.', { email: parsed.error.issues[0].message });
  }

  const confirmacao =
    'Se existir uma conta não confirmada com esse e-mail, enviamos um link novo. Confira também a caixa de spam.';

  const limiteEmail = await verificarLimite('confirmacaoPorEmail', parsed.data);
  if (!limiteEmail.permitido) return formSuccess(confirmacao);

  // Fora do Supabase não há confirmação de e-mail para reenviar: o driver
  // local cria a conta já ativa. Devolver a mesma frase mantém a tela coerente
  // em desenvolvimento, sem prometer um e-mail que não existe.
  if (env.dbDriver() !== 'supabase') return formSuccess(confirmacao);

  try {
    const client = await createSupabaseServerClient();
    await client.auth.resend({
      type: 'signup',
      email: normalizeEmail(parsed.data),
      options: { emailRedirectTo: `${env.siteUrl()}/auth/confirmar` },
    });
  } catch (error) {
    // Nem a falha pode variar com a existência da conta.
    console.error('[resendConfirmationAction]', error);
  }

  return formSuccess(confirmacao);
}

export async function signOutAction(): Promise<void> {
  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
  }

  const store = await cookies();
  store.delete(sessionCookie.name);
  redirect('/');
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return formError('Sua sessão expirou. Entre de novo.');

  const name = text(formData, 'name');
  if (name.length < 2) return formError('Informe seu nome.', { name: 'Informe seu nome.' });

  const repository = await getRepository();
  await repository.updateUser(user.id, { name });
  revalidatePath('/app', 'layout');
  return formSuccess('Nome atualizado.');
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return formError('Sua sessão expirou. Entre de novo.');

  const parsed = passwordSchema.safeParse(text(formData, 'password'));
  if (!parsed.success) {
    return formError('Confira a nova senha.', { password: parsed.error.issues[0].message });
  }

  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    const { error } = await client.auth.updateUser({ password: parsed.data });
    if (error) return formError('Não conseguimos trocar a senha agora. Tente de novo.');
  } else {
    const changed = await changeLocalPassword(user.id, parsed.data);
    if (!changed) return formError('Não conseguimos trocar a senha agora. Tente de novo.');
  }

  return formSuccess('Senha atualizada.');
}

/**
 * Exclusão de conta e de todos os dados.
 *
 * Exige que a pessoa digite EXCLUIR: o botão fica ao lado de "salvar nome", e
 * um clique errado aqui apaga currículo e candidaturas sem volta.
 */
export async function deleteAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return formError('Sua sessão expirou. Entre de novo.');

  if (text(formData, 'confirmacao').toUpperCase() !== 'EXCLUIR') {
    return formError('Digite EXCLUIR para confirmar.', {
      confirmacao: 'Digite exatamente EXCLUIR.',
    });
  }

  const repository = await getRepository();
  await repository.deleteUserData(user.id);

  if (env.dbDriver() === 'supabase') {
    // A linha de `auth.users` só pode ser removida com service_role, que este
    // app não carrega. Os DADOS PESSOAIS já foram apagados acima; o que resta é
    // um registro de login sem conteúdo. Está documentado em /app/configuracoes
    // para ninguém achar que a exclusão foi parcial por descuido.
    const client = await createSupabaseServerClient();
    await client.auth.signOut();
  }

  const store = await cookies();
  store.delete(sessionCookie.name);
  redirect('/');
}

/**
 * Pedido de recuperação de senha.
 *
 * A RESPOSTA É A MESMA EXISTINDO OU NÃO A CONTA, e isso é a decisão central
 * desta função. "E-mail não encontrado" transforma a tela num verificador de
 * cadastro: qualquer pessoa descobre quem tem conta aqui testando endereços.
 * Pelo mesmo motivo o login não diferencia senha errada de e-mail inexistente.
 *
 * Consequência aceita de propósito: quem digita o e-mail errado recebe a mesma
 * confirmação e fica esperando um e-mail que não vem. O texto da tela diz isso,
 * para a pessoa saber que conferir o endereço é o próximo passo.
 */
export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  // Limite antes de qualquer coisa: sem ele, esta tela vira uma máquina de
  // encher a caixa de entrada de outra pessoa — o provedor envia o e-mail, e
  // quem aparece como remetente é este produto.
  const limiteIp = await verificarLimite('recuperacaoPorIp');
  if (!limiteIp.permitido) return formError(mensagemDeLimite(limiteIp.esperarSegundos));

  const email = text(formData, 'email');
  const parsed = emailSchema.safeParse(email);

  // A validação de FORMATO pode falar: dizer "e-mail inválido" para "joao@"
  // não revela cadastro nenhum, e sem isso a pessoa nunca descobre o erro de
  // digitação.
  if (!parsed.success) {
    return formError('Confira o e-mail digitado.', { email: parsed.error.issues[0].message });
  }

  const confirmacao =
    'Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. O link vale por 1 hora. Confira também a caixa de spam.';

  // O limite por e-mail devolve a MESMA confirmação de sempre. Responder
  // "muitas tentativas" só para endereços cadastrados transformaria o limite
  // num verificador de contas — exatamente o que a mensagem neutra evita.
  const limiteEmail = await verificarLimite('recuperacaoPorEmail', parsed.data);
  if (!limiteEmail.permitido) return formSuccess(confirmacao);

  try {
    if (env.dbDriver() === 'supabase') {
      const client = await createSupabaseServerClient();
      await client.auth.resetPasswordForEmail(normalizeEmail(parsed.data), {
        redirectTo: `${env.siteUrl()}/auth/recuperar`,
      });
      // O retorno do Supabase é ignorado de propósito: ele também não deve
      // diferenciar e-mail existente de inexistente na tela.
      return formSuccess(confirmacao);
    }

    const token = await createLocalPasswordReset(parsed.data);
    if (token) {
      // Driver local não tem servidor de e-mail — e não deveria ter, ele existe
      // para o projeto rodar sem configurar serviço nenhum. O link vai para o
      // log, marcado, e o driver é bloqueado em produção de qualquer forma.
      console.info(
        `\n[recuperacao-de-senha] MODO DESENVOLVIMENTO — nenhum e-mail foi enviado.\n` +
          `Abra este link para redefinir a senha de ${normalizeEmail(parsed.data)}:\n` +
          `  ${env.siteUrl()}/nova-senha?token=${token}\n`
      );
    }
    return formSuccess(confirmacao);
  } catch (error) {
    console.error('[requestPasswordResetAction]', error);
    // Nem o erro pode variar com a existência da conta.
    return formSuccess(confirmacao);
  }
}

/**
 * Define a nova senha.
 *
 * Dois caminhos que chegam aqui com credenciais diferentes:
 *
 *   - `supabase`: a pessoa clicou no link do e-mail, passou por
 *     `/auth/recuperar`, e já chega com uma sessão de recuperação no cookie.
 *     Trocar a senha é `updateUser` sobre essa sessão.
 *   - `local`: a prova é o token na URL, verificado e queimado em
 *     `consumeLocalPasswordReset`.
 */
export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = passwordSchema.safeParse(text(formData, 'password'));
  if (!parsed.success) {
    return formError('Confira a senha.', { password: parsed.error.issues[0].message });
  }

  const confirmacao = text(formData, 'confirmacao');
  if (confirmacao !== parsed.data) {
    return formError('As duas senhas precisam ser iguais.', {
      confirmacao: 'A confirmação não confere com a senha.',
    });
  }

  if (env.dbDriver() === 'supabase') {
    const client = await createSupabaseServerClient();
    const { data, error: sessionError } = await client.auth.getUser();
    if (sessionError || !data.user) {
      return formError(
        'Este link expirou ou já foi usado. Peça um novo link de recuperação.',
        undefined,
        'link-de-recuperacao-invalido'
      );
    }

    const { error } = await client.auth.updateUser({ password: parsed.data });
    if (error) {
      console.error('[resetPasswordAction/supabase]', error);
      return formError('Não conseguimos trocar sua senha agora. Tente de novo em instantes.');
    }

    // ENCERRA A SESSÃO DE RECUPERAÇÃO, pelos mesmos dois motivos do driver
    // local: o link do e-mail não pode valer como acesso permanente ao
    // painel, e passar pelo login uma vez confirma que a senha nova é a que
    // a pessoa acha que é.
    //
    // Sem isto havia ainda um segundo defeito, visível: o redirecionamento
    // para /login encontrava uma sessão ativa e quicava direto para /app, e
    // a confirmação "Senha redefinida" nunca chegava a aparecer.
    await client.auth.signOut();
  } else {
    const resultado = await consumeLocalPasswordReset(text(formData, 'token'), parsed.data);
    if (!resultado.ok) {
      const mensagens = {
        invalido: 'Este link não é válido. Peça um novo link de recuperação.',
        expirado: 'Este link expirou. Peça um novo link de recuperação.',
        usado: 'Este link já foi usado. Peça um novo se precisar trocar a senha de novo.',
      } as const;
      return formError(mensagens[resultado.reason], undefined, 'link-de-recuperacao-invalido');
    }

    // NÃO cria sessão automaticamente. Quem redefiniu a senha passa pelo login
    // uma vez: é a confirmação de que a senha nova é a que a pessoa acha que é,
    // e evita que um link vazado vire acesso direto ao painel.
    const store = await cookies();
    store.delete(sessionCookie.name);
  }

  redirect('/login?senha-redefinida=1');
}

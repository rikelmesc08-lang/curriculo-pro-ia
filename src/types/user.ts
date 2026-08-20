/** Usuário autenticado, na forma mínima que a UI precisa. */
export interface AppUser {
  id: string;
  email: string;
  name: string;
  /** Plano ativo. `gratuito` é o padrão enquanto a cobrança não está ligada. */
  plan: 'gratuito' | 'pro';
  createdAt: string;
}

export interface SessionUser extends AppUser {
  /** De onde veio a sessão — some da UI, aparece nas configurações. */
  driver: 'local' | 'supabase';
}

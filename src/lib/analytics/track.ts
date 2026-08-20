'use client';

import type { AnalyticsEventName, AnalyticsProperties } from './events';

/**
 * Emissor de eventos.
 *
 * Hoje ele NÃO envia nada para lugar nenhum. Em desenvolvimento imprime no
 * console para o fluxo poder ser conferido; em produção é silencioso.
 *
 * Ligar um serviço de verdade é acrescentar UM caso em `dispatch` — e, junto,
 * atualizar `/privacidade`. As duas coisas andam juntas de propósito: um
 * produto que manipula nome, telefone e histórico profissional não pode ganhar
 * um rastreador por descuido de implementação.
 */
export function track<E extends AnalyticsEventName>(
  event: E,
  properties: AnalyticsProperties[E] = {} as AnalyticsProperties[E]
): void {
  if (typeof window === 'undefined') return;

  if (process.env.NODE_ENV === 'development') {
    console.info('[analytics]', event, properties);
  }

  // Nenhum destino configurado. Ao integrar um serviço, envie daqui — e nunca
  // acrescente campo com conteúdo de currículo, nome ou e-mail.
}

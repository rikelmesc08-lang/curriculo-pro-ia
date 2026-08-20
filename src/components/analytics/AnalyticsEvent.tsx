'use client';

import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics/track';
import type { AnalyticsEventName, AnalyticsProperties } from '@/lib/analytics/events';

/**
 * Dispara um evento quando a tela aparece.
 *
 * O `useRef` existe para o Strict Mode do React em desenvolvimento, que monta e
 * desmonta cada componente uma vez — sem a trava, todo evento de visualização
 * seria contado em dobro no ambiente local.
 */
export function AnalyticsEvent<E extends AnalyticsEventName>({
  event,
  properties,
}: {
  event: E;
  properties?: AnalyticsProperties[E];
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(event, properties);
  }, [event, properties]);

  return null;
}

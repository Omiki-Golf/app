// Presentation catalog, kept in sync with https://omikigolf.com/#planes.
// Stripe amounts live in supabase/functions/_shared/stripe-domain.ts and must match these prices.
export interface PlanFeature {
  text: string;
  included: boolean;
  bold?: boolean;
}

const feature = (text: string, options: { included?: boolean; bold?: boolean } = {}): PlanFeature =>
  ({ text, included: options.included ?? true, bold: options.bold });

export const planCatalog = [
  {
    id: 'express', name: 'Express', monthly: 0, annual: 0, regularAnnual: null,
    subtitle: 'Para jugadores ocasionales que quieren contar golpes en una partida puntual.',
    action: 'Jugar ahora gratis', heading: 'Incluido en Omiki Express',
    features: [
      feature('Hasta 4 partidas rápidas'),
      feature('Modalidad Stableford básica'),
      feature('Acceso sin registro ni correo electrónico'),
      feature('Sin guardado en la nube', { included: false }),
      feature('Sin estadísticas de hándicap', { included: false }),
    ],
  },
  {
    id: 'player', name: 'Player', monthly: 2.89, annual: 19.99, regularAnnual: 24.99,
    subtitle: 'Para el jugador que quiere analizar su partidas, hándicap y guardar sus tarjetas para siempre.',
    action: 'Suscribirse a Player', heading: 'Lo que compras con Omiki Player',
    features: [
      feature('Partidas Rápidas ILIMITADAS', { bold: true }),
      feature('Historial eterno en la Nube'),
      feature('Gráficos de evolución de Hándicap'),
      feature('Modalidades: Medal, Match Play, Parejas'),
      feature('Unirse GRATIS a grupos de amigos'),
      feature('Prueba Omiki Team durante 30 días', { bold: true }),
    ],
  },
  {
    id: 'team', name: 'Team', monthly: 5.89, annual: 39.99, regularAnnual: 49.99,
    subtitle: 'Para capitanes de pandilla que organizan ligas permanentes y piques de bar.',
    action: 'Suscribirse a Team', heading: 'Ventajas grupales de Omiki Team',
    features: [
      feature('Todo lo de Omiki Player incluido', { bold: true }),
      feature('Crear 1 Grupo de hasta 20 jugadores'),
      feature('Salidas Múltiples con tabla en vivo'),
      feature('Módulo No pasó de rojas (Cervezas / Apuestas)'),
      feature('Estadísticas de Grupo, clasificaciones y rankings históricos'),
      feature('Ampliable con Pack de Gamificación'),
    ],
  },
  {
    id: 'premium', name: 'Premium', monthly: 7.89, annual: 49.99, regularAnnual: 69.99,
    subtitle: 'Para ligas y grupos que quieren una experiencia totalmente personalizada con su propia identidad.',
    action: 'Obtener Omiki Premium', heading: 'Personalización total con Omiki Premium',
    features: [
      feature('Todo lo del Plan Omiki Team', { bold: true }),
      feature('Logo personalizado, colores corporativos y foto de portada'),
      feature('Lema de grupo y Ficha Oficial del grupo en PDF'),
      feature('Personalización de estadisticas, cálculo de handicap, rankings, etc.'),
    ],
  },
  {
    // Pago único por periodo, sin suscripción: no usa los precios mensual/anual.
    id: 'weekend', name: 'Weekend', monthly: 0, annual: 0, regularAnnual: null,
    oneOff: [{ label: '7 días', price: 7.99 }, { label: '3 meses', price: 14.99 }],
    subtitle: 'Para 20 amigos que se ven en verano o se van de viaje de golf. Sin suscripción anual: pagas por 7 días o por 3 meses.',
    action: 'Activar Omiki Weekend', heading: 'Para piques de grupo sin compromiso',
    features: [
      feature('Grupo de hasta 20 jugadores', { bold: true }),
      feature('Salidas Múltiples con tabla en vivo'),
      feature('Módulo No pasó de rojas (Cervezas / Apuestas)'),
      feature('Álbum y resumen final de la competición'),
      feature('Duración: 7 días o 3 meses'),
      feature('Sin suscripción anual'),
      feature('Historial permanente más allá del periodo', { included: false }),
      feature('Rankings históricos de temporada', { included: false }),
      feature('Personalización de grupo', { included: false }),
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string; name: string; monthly: number; annual: number; regularAnnual: number | null;
  oneOff?: ReadonlyArray<{ label: string; price: number }>;
  subtitle: string; action: string; heading: string; features: readonly PlanFeature[];
}>;

export type DisplayPlan = typeof planCatalog[number]['id'];
export const planPrice = (plan: typeof planCatalog[number], annual: boolean) => annual ? plan.annual : plan.monthly;

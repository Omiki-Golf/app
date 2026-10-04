export type ReleaseChangeType = 'new' | 'improved' | 'fixed';

export interface ReleaseChange {
  type: ReleaseChangeType;
  text: string;
}

export interface AppRelease {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: ReleaseChange[];
}

export const APP_VERSION = '1.0.0';

export const RELEASES: AppRelease[] = [
  {
    version: '1.0.0',
    date: '2026-10-04',
    title: 'Primera versión oficial de Omiki Golf',
    summary: 'Consolidación de la app, los planes y la experiencia de juego en producción.',
    changes: [
      { type: 'new', text: 'Interfaz disponible en castellano, inglés, francés e italiano.' },
      { type: 'new', text: 'Prueba Team de 30 días para jugadores con plan Player.' },
      { type: 'improved', text: 'Avatar identificado por el color del plan y perfil reorganizado.' },
      { type: 'improved', text: 'Carga inicial más rápida gracias a la optimización de imágenes.' },
      { type: 'fixed', text: 'Planes actuales e inferiores protegidos frente a selecciones o pagos incorrectos.' },
      { type: 'fixed', text: 'Diálogo de partida decidida más claro, permitiendo continuar anotando resultados.' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-09-30',
    title: 'Administración y plan Premium',
    summary: 'Mayor control operativo y nuevas opciones de suscripción.',
    changes: [
      { type: 'new', text: 'Plan Premium incorporado al catálogo y a la gestión de usuarios.' },
      { type: 'new', text: 'Panel administrativo con métricas de uso, planes y actividad.' },
      { type: 'improved', text: 'Gestión administrativa de jugadores, partidas, grupos y permisos.' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-09-23',
    title: 'Suscripciones y pagos de prueba',
    summary: 'Flujo seguro de contratación y confirmación de planes.',
    changes: [
      { type: 'new', text: 'Checkout de Stripe Sandbox para Player, Team y Premium.' },
      { type: 'improved', text: 'Confirmación de pagos mediante webhook y sincronización idempotente.' },
      { type: 'fixed', text: 'Protecciones para impedir activaciones de planes desde el navegador.' },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-09-19',
    title: 'Jugadores invitados y grupos',
    summary: 'Partidas más flexibles para grupos con jugadores sin cuenta.',
    changes: [
      { type: 'new', text: 'Creación y gestión de jugadores invitados dentro de un grupo.' },
      { type: 'improved', text: 'Historial y resultados preservados al convertir un invitado en jugador registrado.' },
      { type: 'fixed', text: 'Aislamiento de estadísticas y hándicaps entre grupos.' },
    ],
  },
];

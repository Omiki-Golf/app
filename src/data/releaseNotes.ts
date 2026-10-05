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

export const APP_VERSION = '1.5.1';

export const RELEASES: AppRelease[] = [
  {
    version: '1.5.1',
    date: '2026-10-05',
    title: 'Más espacio útil en pantalla',
    summary: 'El acceso a mensajes aprovecha la primera fila existente sin desplazar el contenido.',
    changes: [
      { type: 'improved', text: 'El icono de mensajes se centra en la cabecera y se adapta a las pantallas con títulos o acciones.' },
      { type: 'fixed', text: 'Se elimina la fila superior vacía que reducía el espacio disponible, especialmente en móvil.' },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-10-05',
    title: 'Mensajes globales y actividad de juego',
    summary: 'El buzón permanece accesible durante el juego y muestra automáticamente los momentos destacados de la partida.',
    changes: [
      { type: 'new', text: 'Acceso global a mensajes mediante un panel que conserva la pantalla y el hoyo actuales.' },
      { type: 'new', text: 'Avisos automáticos de Hoyo en uno, No pasó de rojas y Spanish Hands para la partida o el Team.' },
      { type: 'improved', text: 'El contador combina mensajes, invitaciones y actividad pendiente con lectura sincronizada para cuentas registradas.' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-10-05',
    title: 'Identificador para soporte',
    summary: 'Los jugadores registrados pueden localizar y copiar fácilmente el identificador de su cuenta.',
    changes: [
      { type: 'new', text: 'Mis datos de registro incluye el ID de soporte completo y un botón para copiarlo.' },
      { type: 'improved', text: 'El identificador de soporte está disponible en los cuatro idiomas de la aplicación.' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-10-05',
    title: 'Compartir estadísticas con alternativas fiables',
    summary: 'La imagen se prepara antes de abrir el selector del móvil, evitando bloqueos del navegador.',
    changes: [
      { type: 'improved', text: 'Compartir estadísticas utiliza una segunda pulsación directa para abrir WhatsApp mediante el selector del sistema.' },
      { type: 'new', text: 'La imagen generada puede previsualizarse, descargarse o acompañarse de un mensaje abierto en WhatsApp.' },
      { type: 'fixed', text: 'Se evita intentar abrir WhatsApp después de una generación larga, comportamiento que algunos móviles bloqueaban.' },
    ],
  },
  {
    version: '1.2.1',
    date: '2026-10-05',
    title: 'Iniciales dentro de las bolas',
    summary: 'El marcador identifica a cada jugador con sus iniciales integradas en su bola de color.',
    changes: [
      { type: 'improved', text: 'Las iniciales aparecen dentro de la bola del jugador, compartiendo color los miembros de una pareja.' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-05',
    title: 'Marcadores adaptados al móvil',
    summary: 'Los resultados intermedios de Match, Sindicato y Parejas son más compactos y fáciles de identificar.',
    changes: [
      { type: 'new', text: 'Cada jugador tiene una bola de color estable; en Parejas, los compañeros comparten color de equipo.' },
      { type: 'improved', text: 'Los marcadores sustituyen los nombres completos por iniciales y se adaptan al ancho del móvil.' },
    ],
  },
  {
    version: '1.1.1',
    date: '2026-10-05',
    title: 'Cabecera de nueva partida',
    summary: 'La creación de partidas rápidas muestra la marca actual y una navegación más clara.',
    changes: [
      { type: 'improved', text: 'La cabecera muestra OmkiGolf y sitúa el acceso al inicio en la esquina superior izquierda.' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-05',
    title: 'Partidas vinculadas a la cuenta',
    summary: 'Las partidas rápidas de jugadores registrados quedan asociadas a su cuenta y disponibles entre dispositivos.',
    changes: [
      { type: 'new', text: 'Las partidas creadas con sesión iniciada se vinculan al identificador del jugador registrado.' },
      { type: 'new', text: 'Administración puede reasignar partidas rápidas antiguas a un jugador, conservando participantes y resultados.' },
      { type: 'improved', text: 'Cada reasignación requiere confirmación y motivo, y queda registrada en la actividad administrativa.' },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-10-05',
    title: 'Preferencia de tema al iniciar',
    summary: 'Corrección del aspecto inicial para jugadores que utilizan el modo oscuro.',
    changes: [
      { type: 'fixed', text: 'El tema guardado se aplica antes de mostrar la pantalla principal, sin necesidad de abrir primero el perfil.' },
    ],
  },
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

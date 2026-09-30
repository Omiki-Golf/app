// Presentation-only catalog: these prices do not activate subscriptions.
export const planCatalog = [
  { id: 'express', name: 'Express', subtitle: 'Jugadores ocasionales e invitados', monthly: 0, action: 'Jugar ahora gratis', heading: 'Incluido en Omiki Express', features: [
    'Partida rápida de 1 a 4 jugadores (máximo 4 partidas)', 'Acceso sin registro ni correo electrónico', 'Unirse mediante código, enlace o código QR', 'Modalidad básica: tarjeta Stableford individual',
  ] },
  { id: 'player', name: 'Player', subtitle: 'Para el golfista individual', monthly: 2.99, action: 'Suscribirse a Player', heading: 'Lo que compras con Omiki Player', features: [
    'Todo lo de Omiki Express sin límite de partidas', 'Registro de perfil personal e historial en la nube', 'Modalidades: Stableford, Medal Play, Match Play, Sindicato y Parejas', 'Estadísticas avanzadas y evolución histórica del hándicap',
  ] },
  { id: 'team', name: 'Team', subtitle: 'Para pandillas de hasta 20 amigos', monthly: 5.99, action: 'Probar plan Team', heading: 'Ventajas grupales de Omiki Team', features: [
    'Todo el plan Omiki Player para el administrador', 'Creación de 1 grupo permanente de hasta 20 jugadores', 'Salidas múltiples con clasificación en tiempo real (hasta 16 jugadores)', 'Módulo Hoyo 19 (Beer Stats) y exportación de informes en PDF',
  ] },
  { id: 'premium', name: 'Premium', subtitle: 'Ligas y grupos con marca corporativa', monthly: 7.99, action: 'Obtener Omiki Premium', heading: 'Personalización total con Omiki Premium', features: [
    'Todo el plan Omiki Team', 'Escudo o logo personalizado, colores corporativos y foto de portada', 'Lema de grupo y ficha oficial del grupo en PDF', 'Gestión de temporadas simultáneas adicionales (Liga + Copa)',
  ] },
] as const;

export type DisplayPlan = typeof planCatalog[number]['id'];
export const annualPlanPrice = (monthly: number) => monthly === 0 ? 0 :
  (Math.round(monthly * 12 * 0.8 - 0.99) * 100 + 99) / 100;

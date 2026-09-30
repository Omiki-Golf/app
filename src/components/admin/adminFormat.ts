export const modeLabels: Record<string, string> = {
  stableford: 'Stableford', match: 'Match play', sindicato: 'Sindicato', parejas: 'Parejas',
};
export const planLabels: Record<string, string> = { express: 'Express (gratuito)', player: 'ParteePlayer', team: 'ParteeTeam', premium: 'Premium' };
export const shortDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const weekLabel = (value: string) => new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export function sinceLabel(value: string | null | undefined) {
  if (!value) return 'Nunca';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 60) return `Hace ${days} días`;
  const months = Math.round(days / 30);
  return months < 24 ? `Hace ${months} meses` : `Hace ${Math.round(days / 365)} años`;
}

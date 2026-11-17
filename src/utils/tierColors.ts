export type TierColor = 'express' | 'player' | 'team' | 'premium' | 'weekend';

/** Paleta de tiers de Omiki: Team usa el verde #A3E635 y Weekend conserva el naranja. */
export const tierColors: Record<TierColor, {
  ink: string;
  border: string;
  button: string;
  soft: string;
  card: string;
  outlineButton: string;
}> = {
  express: {
    ink: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-300',
    button: 'bg-sky-300 hover:bg-sky-400 text-slate-950',
    soft: 'bg-sky-300/10 text-sky-700 dark:text-sky-200',
    card: 'border-sky-300/70 bg-sky-300/10',
    outlineButton: 'border-sky-300 text-sky-700 hover:bg-sky-300/10 dark:text-sky-200',
  },
  player: {
    ink: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500',
    button: 'bg-emerald-500 hover:bg-emerald-600 text-slate-950',
    soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    card: 'border-emerald-500/70 bg-emerald-500/10',
    outlineButton: 'border-emerald-500 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300',
  },
  team: {
    ink: 'text-lime-700 dark:text-lime-400',
    border: 'border-lime-400',
    button: 'bg-lime-400 hover:bg-lime-500 text-slate-950',
    soft: 'bg-lime-400/10 text-lime-700 dark:text-lime-300',
    card: 'border-lime-400/70 bg-lime-400/10',
    outlineButton: 'border-lime-400 text-lime-700 hover:bg-lime-400/10 dark:text-lime-300',
  },
  premium: {
    ink: 'text-pink-700 dark:text-pink-400',
    border: 'border-pink-500',
    button: 'bg-pink-500 hover:bg-pink-600 text-slate-950',
    soft: 'bg-pink-500/10 text-pink-700 dark:text-pink-300',
    card: 'border-pink-500/70 bg-pink-500/10',
    outlineButton: 'border-pink-500 text-pink-700 hover:bg-pink-500/10 dark:text-pink-300',
  },
  weekend: {
    ink: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-500',
    button: 'bg-orange-500 hover:bg-orange-600 text-slate-950',
    soft: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    card: 'border-orange-500/70 bg-orange-500/10',
    outlineButton: 'border-orange-500 text-orange-700 hover:bg-orange-500/10 dark:text-orange-300',
  },
};

export function groupTier(group: { group_type?: string; premium_branding?: boolean }): 'team' | 'premium' | 'weekend' {
  if (group.group_type === 'weekend') return 'weekend';
  return group.premium_branding ? 'premium' : 'team';
}

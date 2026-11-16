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
    ink: 'text-sky-600 dark:text-sky-400',
    border: 'border-sky-400',
    button: 'bg-sky-400 hover:bg-sky-500 text-slate-950',
    soft: 'bg-sky-400/10 text-sky-700 dark:text-sky-300',
    card: 'border-sky-400/70 bg-sky-400/10',
    outlineButton: 'border-sky-400 text-sky-700 hover:bg-sky-400/10 dark:text-sky-300',
  },
  player: {
    ink: 'text-lime-700 dark:text-lime-400',
    border: 'border-lime-400',
    button: 'bg-lime-400 hover:bg-lime-500 text-slate-950',
    soft: 'bg-lime-400/10 text-lime-700 dark:text-lime-300',
    card: 'border-lime-400/70 bg-lime-400/10',
    outlineButton: 'border-lime-400 text-lime-700 hover:bg-lime-400/10 dark:text-lime-300',
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
    ink: 'text-fuchsia-700 dark:text-fuchsia-400',
    border: 'border-fuchsia-400',
    button: 'bg-fuchsia-400 hover:bg-fuchsia-500 text-slate-950',
    soft: 'bg-fuchsia-400/10 text-fuchsia-700 dark:text-fuchsia-300',
    card: 'border-fuchsia-400/70 bg-fuchsia-400/10',
    outlineButton: 'border-fuchsia-400 text-fuchsia-700 hover:bg-fuchsia-400/10 dark:text-fuchsia-300',
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

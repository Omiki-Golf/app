import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function GlobalMessagesButton({ count, onClick, variant = 'fixed-center', belowWarning = false }: { count: number; onClick: () => void; variant?: 'fixed-center' | 'inline'; belowWarning?: boolean }) {
  const { t } = useTranslation();
  const placement = variant === 'inline'
    ? 'relative'
    : `fixed left-1/2 -translate-x-1/2 ${belowWarning ? 'top-14' : 'top-[max(.75rem,env(safe-area-inset-top))]'} z-[120]`;
  return <button
    type="button"
    onClick={onClick}
    title={t('common.notifications')}
    aria-label={`${t('common.notifications')}: ${count}`}
    className={`${placement} flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-card text-accent-ink shadow-card transition hover:bg-card-2 active:scale-95 ${variant === 'inline' ? 'max-[360px]:h-10 max-[360px]:w-10' : ''}`}
  >
    <Bell size={21} />
    {count > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{count > 99 ? '99+' : count}</span>}
  </button>;
}

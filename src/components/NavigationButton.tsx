import type { ButtonHTMLAttributes } from 'react';
import { ArrowLeft, Home, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NavigationButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  destination?: 'back' | 'home' | 'logout';
}

export function NavigationButton({ destination = 'back', className = '', ...props }: NavigationButtonProps) {
  const { t } = useTranslation();
  const Icon = destination === 'home' ? Home : destination === 'logout' ? LogOut : ArrowLeft;
  const label = destination === 'home' ? t('common.home') : destination === 'logout' ? t('common.logout') : t('common.back');
  const colors = destination === 'logout'
    ? '!border-red-200 !bg-red-50 !text-red-600 hover:!bg-red-100 hover:!text-red-700'
    : '!border-line !bg-card !text-accent-ink hover:!bg-card-2';

  return (
    <button type="button" aria-label={label} title={label} {...props}
      className={`inline-flex !h-11 !w-11 min-h-11 min-w-11 shrink-0 items-center justify-center !rounded-full !border !p-0 shadow-soft transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current ${className} ${colors}`}>
      <Icon size={22} aria-hidden="true" />
    </button>
  );
}

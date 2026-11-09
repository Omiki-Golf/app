import React from 'react';
import { gamificationProduct } from '../data/gamification';

interface GamificationBadgeProps {
  productId: string;
  /** Tamaño del círculo en px (el icono se ajusta). */
  size?: number;
  /** Texto adicional del title/aria-label, p. ej. "Hoyo 4". */
  detail?: string;
  className?: string;
}

/** Ficha circular con el icono del título, igual que la de Spanish Hands. */
export const GamificationBadge: React.FC<GamificationBadgeProps> = ({ productId, size = 20, detail, className = '' }) => {
  const product = gamificationProduct(productId);
  if (!product) return null;
  const Icon = product.icon;
  const label = detail ? `${product.name} · ${detail}` : product.name;
  return (
    <span
      title={label}
      aria-label={label}
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full shadow-soft ${product.badge} ${className}`}
    >
      <Icon size={Math.max(8, Math.round(size * 0.58))} aria-hidden="true" />
    </span>
  );
};

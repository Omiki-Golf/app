import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import { TopBar } from './TopBar';
import React, { useState } from 'react';
import { Users, Palette, Plane, Check, Info} from 'lucide-react';
import { PaymentSelector } from './PaymentSelector';

interface ProShopProps {
  groupId: string | null;
  userId: string;
  onBack: () => void;
  onPurchaseComplete: () => void;
  messagesButton?: React.ReactNode;
}

interface Product {
  type: 'extra_players' | 'premium_branding' | 'weekend_mode';
  icon: React.FC<any>;
  title: string;
  description: string;
  details: string[];
  price: number;
  tooltip: string;
}

const products: Product[] = [
  {
    type: 'extra_players',
    icon: Users,
    title: 'Pack +12 Jugadores',
    description: 'Amplia el limite del grupo de 20 a 32 plazas',
    details: ['32 jugadores maximo', 'Ideal para grandes clubes', 'Pago unico permanente'],
    price: 5000,
    tooltip: 'Aumenta el numero maximo de jugadores que pueden unirse a tu grupo de 20 a 32.',
  },
  {
    type: 'premium_branding',
    icon: Palette,
    title: 'ParTee Premium',
    description: 'Personalizacion de marca para tu club',
    details: ['Escudo del club personalizado', 'Colores personalizados', 'Reglas de apuesta a medida'],
    price: 10000,
    tooltip: 'Activa la personalizacion visual del grupo: escudo, colores y reglas de la gamificacion Hoyo 19.',
  },
  {
    type: 'weekend_mode',
    icon: Plane,
    title: 'ParTee Weekend',
    description: 'Gestion integrada de torneos de viaje',
    details: ['Torneos de 4 a 7 dias', 'Gestion de multiples campos', 'Pago temporal'],
    price: 8000,
    tooltip: 'Activa temporalmente la gestion de torneos de viaje con multiples campos y jornadas.',
  },
];

export const ProShop: React.FC<ProShopProps> = ({ groupId, userId, onBack, onPurchaseComplete, messagesButton }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [purchased, setPurchased] = useState<string | null>(null);

  const handleBuy = (product: Product) => {
    setSelectedProduct(product);
    setShowPayment(true);
  };

  const handlePaymentSuccess = async () => {
    if (!selectedProduct || !groupId) return;
    setPurchased(selectedProduct.type);
    setShowPayment(false);

    // Record purchase in database via supabase
    try {
      const { supabase } = await import('../services/supabaseClient');
      const activeUntil = selectedProduct.type === 'weekend_mode'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await supabase.from('pro_shop_purchases').insert({
        group_id: groupId,
        purchased_by: userId,
        product_type: selectedProduct.type,
        amount_paid: selectedProduct.price,
        payment_method: 'lightning',
        status: 'completed',
        active_until: activeUntil,
      });

      if (selectedProduct.type === 'extra_players') {
        await supabase.from('groups').update({ max_players: 32 }).eq('id', groupId);
      } else if (selectedProduct.type === 'premium_branding') {
        await supabase.from('groups').update({ premium_branding: true }).eq('id', groupId);
      } else if (selectedProduct.type === 'weekend_mode') {
        const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from('groups').update({ weekend_mode_until: until }).eq('id', groupId);
      }
    } catch {
      // payment still succeeded, record may need retry
    }

    setTimeout(() => {
      onPurchaseComplete();
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-app transition-colors">
      <div className="max-w-lg mx-auto px-4 py-6">
        <TopBar left={<NavigationButton destination="back" onClick={onBack} />} center={messagesButton} />

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-ink">Pro-Shop</h1>
          <p className="text-sm text-ink-3">Ampliaciones para tu Team</p>
        </div>

        {!groupId && (
          <div className="rounded-2xl border border-line bg-card p-5 text-center text-sm text-ink-3 shadow-card">
            Abre uno de tus grupos para ver y contratar sus ampliaciones.
          </div>
        )}

        {purchased && (
          <div className="bg-accent-soft border border-accent-ring rounded-xl p-4 mb-5 text-center">
            <Check className="text-accent-ink mx-auto mb-2" size={28} />
            <p className="text-sm font-medium text-accent-ink">Compra completada con exito</p>
          </div>
        )}

        <div className={`space-y-4 ${groupId ? '' : 'hidden'}`}>
          {products.map((product, i) => (
            <div key={i} className="bg-card rounded-2xl shadow-card p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 bg-accent-soft border border-accent-ring rounded-xl flex items-center justify-center shrink-0">
                  <product.icon size={22} className="text-accent-ink" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-ink">{product.title}</h3>
                    <InfoTrigger text={product.tooltip} />
                  </div>
                  <p className="text-sm text-ink-3 mt-0.5">{product.description}</p>
                </div>
              </div>

              <ul className="space-y-1 mb-4">
                {product.details.map((d, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm text-ink-3">
                    <Check size={14} className="text-accent-ink" />
                    {d}
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-ink">{product.price} sats</span>
                <WriteButton
                  onClick={() => handleBuy(product)}
                  className="bg-accent hover:bg-accent-hover text-on-accent font-semibold px-6 py-2.5 rounded-xl transition-colors text-sm"
                >
                  Comprar
                </WriteButton>
              </div>
            </div>
          ))}
        </div>

        {showPayment && selectedProduct && (
          <PaymentSelector
            isOpen={showPayment}
            onClose={() => setShowPayment(false)}
            planType="team"
            userId={userId}
            amount={selectedProduct.price}
            description={selectedProduct.title}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    </div>
  );
};

const InfoTrigger: React.FC<{ text: string }> = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        className="text-ink-4 hover:text-ink-3"
      >
        <Info size={14} />
      </button>
      {show && (
        <div className="absolute z-50 right-0 top-6 w-56 bg-ink text-card text-xs p-2.5 rounded-lg shadow-card">
          {text}
        </div>
      )}
    </div>
  );
};

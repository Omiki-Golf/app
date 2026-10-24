import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Zap, CheckCircle2, Copy, Check } from 'lucide-react';
import { createInvoice, checkPayment, LightningInvoice } from '../services/lightningService';
import { supabase } from '../services/supabaseClient';
import { UserTier } from '../types';

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  targetTier?: UserTier;
  onSuccess?: (tier?: UserTier) => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose, userId, targetTier, onSuccess }) => {
  const [invoiceData, setInvoiceData] = useState<LightningInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerateInvoice = async () => {
    setLoading(true);
    setError(null);

    try {
      const invoiceMemo = targetTier
        ? `Actualización de tier: ${targetTier} - Usuario ${userId}`
        : `Suscripción Premium User: ${userId}`;

      const invoice = await createInvoice(15, invoiceMemo);
      setInvoiceData(invoice);
      setLoading(false);

      const intervalId = setInterval(async () => {
        try {
          const status = await checkPayment(invoice.chargeId);
          if (status.paid) {
            clearInterval(intervalId);
            setPaid(true);

            if (userId) {
              const expiresAt = new Date();
              expiresAt.setMonth(expiresAt.getMonth() + 1);

              await supabase.from('user_subscriptions').upsert({
                user_id: userId,
                status: 'active',
                current_period_end: expiresAt.toISOString(),
                updated_at: new Date().toISOString(),
              });

              if (targetTier) {
                await supabase.auth.updateUser({
                  data: {
                    user_tier: targetTier,
                    tier: targetTier,
                  },
                });
              }

              onSuccess?.(targetTier);
            }
          }
        } catch (err) {
          console.warn('Error en polling de pago:', err);
        }
      }, 3000);

    } catch (err: any) {
      console.error('Error al generar la factura:', err);
      setError(err.message || 'Error al conectar con la pasarela BTCPay');
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (invoiceData?.paymentRequest) {
      navigator.clipboard.writeText(invoiceData.paymentRequest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-2xl max-w-md w-full p-6 relative shadow-card">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-4 hover:text-ink-3"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Zap className="text-amber-500" size={24} />
          </div>
          <h2 className="text-2xl font-bold text-ink">
            {targetTier ? `Actualizar a ${targetTier}` : 'Suscripción Premium'}
          </h2>
          <p className="text-sm text-ink-3 mt-1">Paga instantáneamente con Bitcoin Lightning</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4 text-center">
            {error}
          </div>
        )}

        {!invoiceData ? (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
              {targetTier
                ? `Actualiza tu perfil a ${targetTier} con un pago único de 15 sats.`
                : 'Obtén acceso ilimitado a todas las funciones por solo 15 sats.'}
            </div>
            <button
              onClick={handleGenerateInvoice}
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? 'Generando factura...' : 'Pagar con Lightning'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            {paid ? (
              <div className="text-center py-6">
                <CheckCircle2 className="text-accent-ink w-16 h-16 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-ink">¡Pago Confirmado!</h3>
                <p className="text-sm text-ink-3 mb-4">Ya eres usuario Premium.</p>
                <button
                  onClick={() => {
                    onClose();
                    window.location.reload();
                  }}
                  className="bg-accent text-on-accent font-semibold px-6 py-2 rounded-xl text-sm"
                >
                  Continuar
                </button>
              </div>
            ) : (
              <>
                <div className="bg-card p-4 border-2 border-amber-200 rounded-xl shadow-inner">
                  <QRCodeSVG value={invoiceData.paymentRequest} size={200} level="M" />
                </div>
                <p className="text-xs text-ink-3 text-center">
                  Escanea este código QR con <strong>Wallet of Satoshi</strong> para pagar los 15 sats.
                </p>
                <button
                  onClick={handleCopy}
                  className="text-xs text-amber-700 hover:underline font-medium flex items-center gap-1"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? '¡Copiado!' : 'Copiar texto de la factura'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
import { WriteButton } from '../context/ReadOnlyContext';
import { NavigationButton } from './NavigationButton';
import React, { useState } from 'react';
import { X, CreditCard, Zap, Check, ArrowLeft, AlertCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { createInvoice, checkPayment, LightningInvoice } from '../services/lightningService';
import { supabase } from '../services/supabaseClient';
import { userService } from '../services/userService';
import { PlanType } from '../types';

interface PaymentSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  planType: PlanType;
  userId: string;
  amount: number;
  description: string;
  onSuccess: () => void;
}

type PaymentMethod = 'lightning' | 'stripe';
type PaymentState = 'select' | 'processing' | 'success' | 'stripe-placeholder';

export const PaymentSelector: React.FC<PaymentSelectorProps> = ({
  isOpen,
  onClose,
  planType,
  userId,
  amount,
  description,
  onSuccess,
}) => {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [state, setState] = useState<PaymentState>('select');
  const [invoiceData, setInvoiceData] = useState<LightningInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleLightning = async () => {
    setMethod('lightning');
    setState('processing');
    setError(null);

    try {
      const invoice = await createInvoice(amount, `${description} - User: ${userId}`);
      setInvoiceData(invoice);
      setState('select');

      const intervalId = setInterval(async () => {
        try {
          const status = await checkPayment(invoice.chargeId);
          if (status.paid) {
            clearInterval(intervalId);
            setState('success');
            await userService.setPlanType(userId, planType, invoice.chargeId);
            setTimeout(() => {
              onSuccess();
              handleClose();
            }, 2000);
          }
        } catch (err) {
          console.warn('Error polling:', err);
        }
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Error al generar la factura Lightning');
      setState('select');
    }
  };

  const handleStripe = () => {
    setMethod('stripe');
    setState('stripe-placeholder');
  };

  const handleClose = () => {
    setMethod(null);
    setState('select');
    setInvoiceData(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  const handleCopy = () => {
    if (invoiceData?.paymentRequest) {
      navigator.clipboard.writeText(invoiceData.paymentRequest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (state === 'success') {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-card rounded-2xl max-w-md w-full p-8 text-center shadow-card">
          <div className="w-20 h-20 bg-accent-soft rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="text-accent-ink" size={40} />
          </div>
          <h2 className="text-2xl font-bold text-ink mb-2">Pago confirmado</h2>
          <p className="text-ink-3">Tu plan {planType === 'player' ? 'Player' : 'Team'} esta activo</p>
        </div>
      </div>
    );
  }

  if (state === 'stripe-placeholder') {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-card relative">
          <button onClick={handleClose} className="absolute top-4 right-4 text-ink-4 hover:text-ink-3">
            <X size={20} />
          </button>
          <NavigationButton destination="back"
            onClick={() => setState('select')}
            className="absolute top-3 left-3 bg-card-2 hover:bg-neutral-hover text-ink-2 font-semibold px-3 py-2.5 rounded-xl text-sm transition-colors"
          />
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="text-blue-600" size={28} />
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Pago con tarjeta</h2>
            <p className="text-sm text-ink-3 mb-4">
              La pasarela de Stripe se activara cuando configures tu cuenta de Stripe.
              Por ahora, puedes pagar con Bitcoin Lightning.
            </p>

          </div>
        </div>
      </div>
    );
  }

  if (method === 'lightning' && invoiceData) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-card relative">
          <NavigationButton
            onClick={() => { setMethod(null); setInvoiceData(null); setState('select'); }}
            className="absolute top-3 left-3 text-ink-3 hover:text-ink"
          />
          <button onClick={handleClose} className="absolute top-4 right-4 text-ink-4 hover:text-ink-3">
            <X size={20} />
          </button>
          <div className="flex flex-col items-center space-y-4">
            <h2 className="text-xl font-bold text-ink">Pagar con Lightning</h2>
            <div className="bg-card p-4 border-2 border-amber-200 rounded-xl shadow-inner">
              <QRCodeSVG value={invoiceData.paymentRequest} size={200} level="M" />
            </div>
            <p className="text-xs text-ink-3 text-center">
              Escanea este codigo QR con tu wallet de Bitcoin Lightning
            </p>
            <button
              onClick={handleCopy}
              className="text-xs text-amber-700 hover:underline font-medium flex items-center gap-1"
            >
              {copied ? <Check size={14} /> : <ArrowLeft size={14} />}
              {copied ? 'Copiado' : 'Copiar factura'}
            </button>
            <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-sm text-amber-800">Esperando confirmacion del pago...</p>
              <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mx-auto mt-2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payment method selector
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-card relative">
        <button onClick={handleClose} className="absolute top-4 right-4 text-ink-4 hover:text-ink-3">
          <X size={20} />
        </button>
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-ink mb-1">Elige como pagar</h2>
          <p className="text-sm text-ink-3">{description}</p>
          <p className="text-2xl font-bold text-ink mt-2">{amount} sats</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4 text-center flex items-center justify-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <WriteButton
            onClick={handleLightning}
            disabled={state === 'processing'}
            className="w-full flex items-center gap-3 bg-amber-50 hover:bg-amber-100 border-2 border-amber-300 px-5 py-4 rounded-xl transition-all disabled:opacity-50"
          >
            <div className="w-10 h-10 bg-amber-500 rounded-lg flex items-center justify-center">
              <Zap className="text-white" size={20} />
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-ink">Bitcoin Lightning</p>
              <p className="text-xs text-ink-3">Pago instantaneo con tu wallet</p>
            </div>
            {state === 'processing' && (
              <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
            )}
          </WriteButton>

          <WriteButton
            onClick={handleStripe}
            className="w-full flex items-center gap-3 bg-blue-50 hover:bg-blue-100 border-2 border-blue-300 px-5 py-4 rounded-xl transition-all"
          >
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <CreditCard className="text-white" size={20} />
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold text-ink">Tarjeta (Stripe)</p>
              <p className="text-xs text-ink-3">Visa, Mastercard, etc.</p>
            </div>
          </WriteButton>
        </div>
      </div>
    </div>
  );
};

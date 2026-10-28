// src/components/LightningPayment.tsx
// Componente que muestra el QR de Lightning y espera el pago

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Zap, Copy, CheckCircle, Loader2, X } from 'lucide-react';
import { createInvoice, checkPayment, LightningInvoice } from '../services/lightningService';
import { getErrorMessage } from '../utils/errorMessage';

interface LightningPaymentProps {
  amountSats: number;
  description: string;
  onSuccess: (invoice: LightningInvoice) => void;
  onCancel?: () => void;
}

type PaymentState = 'idle' | 'creating' | 'waiting' | 'paid' | 'error';

export const LightningPayment: React.FC<LightningPaymentProps> = ({
  amountSats,
  description,
  onSuccess,
  onCancel,
}) => {
  const [state, setState] = useState<PaymentState>('idle');
  const [invoice, setInvoice] = useState<LightningInvoice | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const startPayment = useCallback(async () => {
    setState('creating');
    setErrorMsg('');
    setElapsed(0);

    try {
      const inv = await createInvoice(amountSats, description);
      setInvoice(inv);
      setState('waiting');

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      intervalRef.current = setInterval(async () => {
        try {
          const status = await checkPayment(inv.chargeId);
          if (status.paid) {
            cleanup();
            setState('paid');
            onSuccess(inv);
          }
        } catch (err) {
          console.warn('Polling error:', err);
        }
      }, 3000);

      timeoutRef.current = setTimeout(() => {
        if (intervalRef.current) {
          cleanup();
          setState('error');
          setErrorMsg('El tiempo para pagar ha expirado. Intenta de nuevo.');
        }
      }, 600_000);
    } catch (err: unknown) {
      setState('error');
      setErrorMsg(getErrorMessage(err, 'Error al crear el invoice. Intenta de nuevo.'));
    }
  }, [amountSats, description, onSuccess, cleanup]);

  useEffect(() => {
    void startPayment();
    return cleanup;
  }, [startPayment, cleanup]);

  const copyInvoice = async () => {
    if (!invoice) return;
    try {
      await navigator.clipboard.writeText(invoice.paymentRequest);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = invoice.paymentRequest;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 max-w-sm mx-auto text-center relative">
      {onCancel && state !== 'paid' && (
        <button
          onClick={() => { cleanup(); onCancel(); }}
          className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      )}

      <div className="flex items-center justify-center gap-2 mb-4">
        <Zap size={24} className="text-amber-400" />
        <h3 className="text-xl font-black text-white">Pagar con Bitcoin</h3>
      </div>

      {state === 'creating' && (
        <div className="py-8">
          <Loader2 size={40} className="animate-spin text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-400">Generando invoice...</p>
        </div>
      )}

      {state === 'waiting' && invoice && (
        <>
          <div className="mb-4">
            <p className="text-amber-400 font-bold text-2xl">{amountSats.toLocaleString()} sats</p>
            <p className="text-gray-500 text-xs mt-1">≈ {(amountSats / 100000000 * 60000).toFixed(2)}€ *</p>
            <p className="text-gray-600 text-[10px]">*Tipo de cambio aproximado</p>
          </div>

          <div className="bg-white p-3 rounded-xl inline-block mb-4 shadow-lg">
            <QRCodeSVG value={invoice.paymentRequest} size={200} level="M" includeMargin={false} />
          </div>

          <div className="bg-slate-800 rounded-lg p-2 mb-3 flex items-center gap-2">
            <p className="text-gray-400 text-[10px] truncate flex-1 text-left font-mono">
              {invoice.paymentRequest.slice(0, 20)}...{invoice.paymentRequest.slice(-15)}
            </p>
            <button onClick={copyInvoice} className="text-emerald-400 hover:text-emerald-300 flex-shrink-0">
              {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
            </button>
          </div>

          <p className="text-gray-400 text-xs mb-3">
            Escanea con cualquier wallet Lightning:<br />
            <span className="text-gray-500">Phoenix, Breez, Wallet of Satoshi, Strike...</span>
          </p>

          <div className="flex items-center justify-center gap-1 text-gray-500 text-xs">
            <Loader2 size={12} className="animate-spin" />
            <span>Esperando pago... {formatTime(elapsed)}</span>
          </div>
        </>
      )}

      {state === 'paid' && (
        <div className="py-6">
          <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/30">
            <CheckCircle size={32} className="text-white" />
          </div>
          <p className="text-emerald-400 font-bold text-xl mb-1">¡Pago recibido!</p>
          <p className="text-gray-400 text-sm">Tu cuenta Premium está activa.</p>
        </div>
      )}

      {state === 'error' && (
        <div className="py-6">
          <p className="text-red-400 font-semibold mb-2">Ups, algo falló</p>
          <p className="text-gray-400 text-sm mb-4">{errorMsg}</p>
          <button
            onClick={startPayment}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-6 rounded-lg"
          >
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
};
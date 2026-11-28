import React, { Component, ReactNode } from 'react';
import i18n from '../i18n';
import { reportClientError } from '../services/errorReporting';
import { OmikiLoadingScreen } from './OmikiSpinner';

interface Props {
  children: ReactNode;
}

interface State {
  // recovering: la app se recarga sola (o espera cobertura) mostrando solo la pantalla de carga.
  // failed: el fallo se repite justo después de recargar; se ofrece reintentar con un aviso tranquilo.
  phase: 'ok' | 'recovering' | 'failed';
}

const RELOAD_KEY = 'omiki.chunkReloadAt';
const RELOAD_WINDOW_MS = 60000;

/** Recarga si no se ha recargado en el último minuto: así un fallo persistente no entra en bucle. */
const reloadOnce = (): boolean => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
};

/**
 * Si una pantalla falla al dibujarse, el cliente no ve ningún error: se registra el fallo y la app
 * se recarga sola con la pantalla de carga de Omiki (sin cobertura, en cuanto vuelva). Los golpes ya
 * están guardados y la partida activa se reabre en el hoyo pendiente.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { phase: 'ok' };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { phase: 'recovering' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    void reportClientError(error, errorInfo.componentStack);
    if (!navigator.onLine) {
      window.addEventListener('online', this.handleOnline, { once: true });
      return;
    }
    if (!reloadOnce()) this.setState({ phase: 'failed' });
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
  }

  handleOnline = () => {
    if (!reloadOnce()) this.setState({ phase: 'failed' });
  };

  handleRetry = () => {
    try { window.sessionStorage.removeItem(RELOAD_KEY); } catch { /* Se recarga igualmente. */ }
    window.location.reload();
  };

  render() {
    if (this.state.phase === 'recovering') {
      return <OmikiLoadingScreen label={i18n.t('errorBoundary.recovering')} delayMs={0} />;
    }
    if (this.state.phase === 'failed') {
      return (
        <div className="min-h-screen bg-app flex items-center justify-center p-4" role="status">
          <div className="max-w-sm w-full bg-card rounded-2xl shadow-card p-6 text-center">
            <h1 className="text-xl font-bold text-title mb-2">{i18n.t('errorBoundary.title')}</h1>
            <p className="text-ink-3 mb-5">{i18n.t('errorBoundary.message')}</p>
            <button
              onClick={this.handleRetry}
              className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
            >
              {i18n.t('errorBoundary.retry')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

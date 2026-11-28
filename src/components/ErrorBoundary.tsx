import React, { Component, ReactNode } from 'react';
import i18n from '../i18n';
import { isChunkLoadError, reportClientError } from '../services/errorReporting';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  offline: boolean;
}

const RELOAD_KEY = 'omiki.chunkReloadAt';

/** Recarga una sola vez cada 10 s para no entrar en bucle si el fallo persiste. */
const reloadOnce = (): boolean => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 10000) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
};

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, offline: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, offline: typeof navigator !== 'undefined' && !navigator.onLine };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    void reportClientError(error, errorInfo.componentStack);
    // Una parte de la app no se pudo descargar (sin cobertura o versión nueva publicada):
    // con conexión se recarga sola; sin ella, en cuanto vuelva la cobertura.
    if (isChunkLoadError(error)) {
      if (navigator.onLine) reloadOnce();
      else window.addEventListener('online', this.handleOnline, { once: true });
    }
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
  }

  handleOnline = () => {
    if (!reloadOnce()) this.setState({ offline: false });
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, offline: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-6">
            <div className="text-center">
              <div className="text-red-600 text-6xl mb-4">⚠️</div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {i18n.t('errorBoundary.title')}
              </h1>
              <p className="text-gray-600 mb-4">
                {this.state.offline ? i18n.t('errorBoundary.offline') : i18n.t('errorBoundary.message')}
              </p>
              {this.state.error && (
                <details className="text-left bg-gray-50 p-3 rounded mb-4">
                  <summary className="cursor-pointer font-semibold text-gray-700">
                    {i18n.t('errorBoundary.details')}
                  </summary>
                  <pre className="mt-2 text-xs text-gray-600 overflow-auto">
                    {this.state.error.toString()}
                  </pre>
                </details>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={this.handleRetry}
                  className="border-2 border-emerald-600 text-emerald-700 px-6 py-2 rounded-lg font-semibold hover:bg-emerald-50 transition-colors"
                >
                  {i18n.t('errorBoundary.retry')}
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
                >
                  {i18n.t('common.reload')}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

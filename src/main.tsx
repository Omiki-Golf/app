import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

if (import.meta.env.DEV) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}
import { ApplicationGateway } from './components/admin/ApplicationGateway';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import './i18n';
import './index.css';

try {
  const rootElement = document.getElementById('root');

  if (!rootElement) {
    throw new Error('Root element not found');
  }

  const root = createRoot(rootElement);

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <ApplicationGateway />
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>
  );
} catch (error) {
  console.error('Error initializing app:', error);
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(to bottom right, #f0fdf4, #d1fae5); padding: 1rem;">
      <div style="background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 500px;">
        <h1 style="color: #991b1b; font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem;">Error al cargar la aplicación</h1>
        <p style="color: #4b5563; margin-bottom: 1rem;">Ha ocurrido un error al inicializar la aplicación. Por favor, intenta lo siguiente:</p>
        <ul style="color: #4b5563; margin-left: 1.5rem; margin-bottom: 1rem;">
          <li>Recarga la página</li>
          <li>Limpia la caché de tu navegador</li>
        </ul>
        <button onclick="window.location.reload()" style="background: #059669; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; border: none; cursor: pointer; font-weight: 600;">
          Recargar página
        </button>
        <details style="margin-top: 1rem;">
          <summary style="cursor: pointer; color: #059669; font-weight: 600;">Detalles técnicos</summary>
          <pre style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin-top: 0.5rem; overflow: auto; font-size: 0.875rem;">${error}</pre>
        </details>
      </div>
    </div>
  `;
}

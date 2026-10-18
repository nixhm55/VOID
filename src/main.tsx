import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener(
    'error',
    (evt) => {
      if (!evt.error || !(evt.error instanceof Error) || evt.error.name === 'AbortError') {
        evt.stopImmediatePropagation();
        evt.preventDefault();
      }
    },
    true
  );
  window.addEventListener(
    'unhandledrejection',
    (evt) => {
      const reason = evt.reason;
      if (
        !reason ||
        !(reason instanceof Error) ||
        reason.name === 'AbortError' ||
        reason.name === 'NotAllowedError'
      ) {
        evt.stopImmediatePropagation();
        evt.preventDefault();
      }
    },
    true
  );
  // Dismiss any stale vite-error-overlay element if present
  try {
    document.querySelectorAll('vite-error-overlay').forEach((el) => el.remove());
  } catch {}
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

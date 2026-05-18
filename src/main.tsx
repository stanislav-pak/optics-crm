import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.ready.then(reg => reg.active?.postMessage('clearBadge'));
      if ('clearAppBadge' in navigator) navigator.clearAppBadge();
    }
  });
}


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
      // Только убираем баннеры уведомлений из шторки — сам бейдж на иконке
      // считается по реальному непрочитанному в App.tsx (totalBadge) и не должен
      // сбрасываться просто от открытия приложения (как в WhatsApp)
      navigator.serviceWorker.ready.then(reg => reg.active?.postMessage('clearBadge'));
    }
  });
}


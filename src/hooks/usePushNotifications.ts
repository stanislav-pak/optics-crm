import { useEffect } from 'react';
import { supabase } from '../services/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
// Включается только в тестовом окружении (VITE_DEBUG_PUSH=true в Vercel test-проекте) —
// подробные alert() на каждом шаге подписки, чтобы отловить причину тихого не-подключения на iOS PWA (#T45)
const DEBUG_PUSH = import.meta.env.VITE_DEBUG_PUSH === 'true';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush(employeeId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (DEBUG_PUSH) alert('Push не поддерживается браузером: serviceWorker=' + ('serviceWorker' in navigator) + ', PushManager=' + ('PushManager' in window));
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    if (DEBUG_PUSH) alert('Разрешение на уведомления: "' + permission + '" (нужно "granted")');
    return;
  }
  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const subJson = sub.toJSON() as { endpoint?: string };
  const endpoint = subJson.endpoint ?? '';

  // Upsert по employee_id + endpoint — каждое устройство хранит свою подписку (#14)
  const { error: upsertError } = await supabase
    .from('push_subscriptions')
    .upsert(
      { employee_id: employeeId, endpoint, subscription: sub.toJSON() },
      { onConflict: 'employee_id,endpoint' }
    );
  if (upsertError) throw upsertError;
  if (DEBUG_PUSH) alert('Push подключён, endpoint: ' + endpoint.slice(-24));
}

export function usePushNotifications(employeeId?: string) {
  useEffect(() => {
    if (!employeeId) return;
    subscribeToPush(employeeId).catch(e => {
      console.error(e);
      alert('Не удалось подключить push-уведомления: ' + (e?.message || e));
    });
  }, [employeeId]);
}

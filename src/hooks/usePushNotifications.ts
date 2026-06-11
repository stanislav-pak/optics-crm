import { useEffect } from 'react';
import { supabase } from '../services/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  // Всегда делаем upsert, не только при первой подписке
  const { data: existing } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (existing) {
    await supabase.from('push_subscriptions')
      .update({ subscription: sub.toJSON() })
      .eq('employee_id', employeeId);
  } else {
    await supabase.from('push_subscriptions')
      .insert({ employee_id: employeeId, subscription: sub.toJSON() });
  }
}

export function usePushNotifications(employeeId?: string) {
  useEffect(() => {
    if (!employeeId) return;
    subscribeToPush(employeeId).catch(console.error);
  }, [employeeId]);
}

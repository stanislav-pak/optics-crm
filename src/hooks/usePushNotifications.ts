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
  if (!('serviceWorker' in navigator)) { alert('❌ No ServiceWorker'); return; }
  if (!('PushManager' in window)) { alert('❌ No PushManager'); return; }
  if (!VAPID_PUBLIC_KEY) { alert('❌ No VAPID key'); return; }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { alert(`❌ Permission: ${permission}`); return; }

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) await existing.unsubscribe();

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { error } = await supabase.from('push_subscriptions').upsert({
      employee_id: employeeId,
      subscription: subscription.toJSON(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' });

    if (error) { alert(`❌ DB error: ${error.message}`); return; }
    alert('✅ Push подписка создана!');
  } catch (e: any) {
    alert(`❌ Error: ${e.message}`);
  }
}

export function usePushNotifications(employeeId?: string) {
  useEffect(() => {
    if (!employeeId) return;
    subscribeToPush(employeeId);
  }, [employeeId]);
}
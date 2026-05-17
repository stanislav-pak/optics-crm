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

async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

export function usePushNotifications(employeeId?: string) {
  useEffect(() => {
    if (!employeeId) return;

    subscribeToPush().catch(console.error);

    const channel = supabase
      .channel('push-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, async (payload) => {
        const msg = payload.new as any;
        if (msg.direction !== 'inbound') return;

        const { data: chat } = await supabase
          .from('chats')
          .select('employee_id, client:clients(name, phone)')
          .eq('id', msg.chat_id)
          .single();

        if (!chat || chat.employee_id !== employeeId) return;

        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.getSubscription();
        if (!subscription) return;

        const client = chat.client as any;
        const name = client?.name || client?.phone || 'Клиент';

        await supabase.functions.invoke('send-push', {
          body: { subscription, title: `Новое сообщение от ${name}`, body: msg.content },
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employeeId]);
}

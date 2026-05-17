import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

export function usePushNotifications(employeeId?: string) {
  const permissionRef = useRef<NotificationPermission>('default');

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    permissionRef.current = permission;
  };

  const showNotification = (title: string, body: string) => {
    if (permissionRef.current !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    });
  };

  useEffect(() => {
    if (!employeeId) return;
    requestPermission();

    const channel = supabase
      .channel('push-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `direction=eq.inbound`,
      }, async (payload) => {
        const msg = payload.new as any;

        const { data: chat } = await supabase
          .from('chats')
          .select('employee_id, client:clients(name, phone)')
          .eq('id', msg.chat_id)
          .single();

        if (!chat || chat.employee_id !== employeeId) return;

        const client = chat.client as any;
        const name = client?.name || client?.phone || 'Клиент';
        showNotification(`Новое сообщение от ${name}`, msg.content);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employeeId]);

  return { requestPermission };
}

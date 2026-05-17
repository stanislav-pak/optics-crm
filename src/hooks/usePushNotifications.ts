import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

function playSound() {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.frequency.value = 880;
  oscillator.type = 'sine';
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.4);
}

export function usePushNotifications(employeeId?: string) {
  const permissionRef = useRef<NotificationPermission>('default');

  const requestPermission = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    permissionRef.current = permission;
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
        filter: 'direction=eq.inbound',
      }, async (payload) => {
        const msg = payload.new as any;

        const { data: chat } = await supabase
          .from('chats')
          .select('employee_id, client:clients(name, phone)')
          .eq('id', msg.chat_id)
          .single();

        if (!chat || chat.employee_id !== employeeId) return;

        playSound();

        if (permissionRef.current === 'granted' && document.visibilityState !== 'visible') {
          const client = chat.client as any;
          const name = client?.name || client?.phone || 'Клиент';
          new Notification(`Новое сообщение от ${name}`, {
            body: msg.content,
            icon: '/favicon.ico',
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [employeeId]);

  return { requestPermission };
}

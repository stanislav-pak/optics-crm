import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { getChats } from '../services/chats';
import { playNotificationSound } from '../utils/sound';
import type { Chat, ChatListFilters } from '../types';

export function useChats(filters?: ChatListFilters) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUnreadRef = useRef<number>(0);

  useEffect(() => {
    const clearBadge = () => {
      if ('setAppBadge' in navigator) (navigator as any).setAppBadge(0);
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) clearBadge(); });
    return () => document.removeEventListener('visibilitychange', clearBadge);
  }, []);

  const fetchChats = useCallback(async (playSound = false) => {
    try {
      setError(null);
      const data = await getChats(filters);
      setChats(data);
      const totalUnread = data.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);

      // Звук при новых непрочитанных
      if (playSound && totalUnread > prevUnreadRef.current) {
        playNotificationSound();
      }
      prevUnreadRef.current = totalUnread;

      if ('setAppBadge' in navigator) {
        (navigator as any).setAppBadge(totalUnread);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки чатов');
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.search, filters?.branch_id, filters?.employee_id]);

  useEffect(() => {
    fetchChats(false);
    const handleClientUpdate = () => fetchChats(false);
    window.addEventListener('client-updated', handleClientUpdate);
    window.addEventListener('messages-read', () => fetchChats(false));

    const channel = supabase
      .channel('chats-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchChats(true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, () => fetchChats(false))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients' }, () => fetchChats(false))
      .subscribe();

    return () => {
      window.removeEventListener('messages-read', () => fetchChats(false));
      window.removeEventListener('client-updated', handleClientUpdate);
      supabase.removeChannel(channel);
    };
  }, [fetchChats]);

  return { chats, loading, error, refetch: fetchChats };
}
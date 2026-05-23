import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { getChats } from '../services/chats';
import type { Chat, ChatListFilters } from '../types';

export function useChats(filters?: ChatListFilters) {
  useEffect(() => {
    const clearBadge = () => {
      if ('setAppBadge' in navigator) (navigator as any).setAppBadge(0);
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) clearBadge(); });
    return () => document.removeEventListener('visibilitychange', clearBadge);
  }, []);

  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    try {
      setError(null);
      const data = await getChats(filters);
      setChats(data);
      const totalUnread = data.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
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
    fetchChats();
    const handleClientUpdate = () => fetchChats();
    window.addEventListener('client-updated', handleClientUpdate);
    window.addEventListener('messages-read', fetchChats);

    const channel = supabase
      .channel('chats-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchChats())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, () => fetchChats())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients' }, () => fetchChats())
      .subscribe();

    return () => {
      window.removeEventListener('messages-read', fetchChats);
      window.removeEventListener('client-updated', handleClientUpdate);
      supabase.removeChannel(channel);
    };
  }, [fetchChats]);

  return { chats, loading, error, refetch: fetchChats };
}

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { getChats } from '../services/chats';
import type { Chat, ChatListFilters } from '../types';

export function useChats(filters?: ChatListFilters) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchChats = useCallback(async () => {
    try {
      setError(null);
      const data = await getChats(filters);
      setChats(data);
      const totalUnread = data.reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0);
      setUnreadCount(totalUnread);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки чатов');
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.search, filters?.branch_id, filters?.employee_id]);

  useEffect(() => {
    fetchChats();

    // При возврате во вкладку — пересчитываем данные и обновляем бейдж точным значением
    const onVisibility = () => { if (!document.hidden) fetchChats(); };
    document.addEventListener('visibilitychange', onVisibility);

    // Кастомные события из ChatWindow и других компонентов
    window.addEventListener('messages-read', fetchChats);
    window.addEventListener('client-updated', fetchChats);

    const channel = supabase
      .channel('chats-realtime')
      // Новое сообщение → пересчитать unread
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchChats())
      // Сообщение помечено прочитанным → пересчитать unread
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => fetchChats())
      // Смена статуса чата, last_message_at и т.д.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, () => fetchChats())
      // Смена данных клиента
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients' }, () => fetchChats())
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('messages-read', fetchChats);
      window.removeEventListener('client-updated', fetchChats);
      supabase.removeChannel(channel);
    };
  }, [fetchChats]);

  return { chats, loading, error, refetch: fetchChats, unreadCount };
}

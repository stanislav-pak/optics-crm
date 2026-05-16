import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { getChats } from '../services/chats';
import type { Chat, ChatListFilters } from '../types';

export function useChats(filters?: ChatListFilters) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChats = useCallback(async () => {
    try {
      setError(null);
      const data = await getChats(filters);
      setChats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки чатов');
    } finally {
      setLoading(false);
    }
  }, [filters?.status, filters?.search]);

  useEffect(() => {
    fetchChats();

    const handleClientUpdate = () => fetchChats();
    window.addEventListener('client-updated', handleClientUpdate);

    const channel = supabase
      .channel('chats-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchChats())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats' }, () => fetchChats())
      .subscribe();

    return () => {
      window.removeEventListener('client-updated', handleClientUpdate);
      supabase.removeChannel(channel);
    };
  }, [fetchChats]);

  return { chats, loading, error, refetch: fetchChats };
}

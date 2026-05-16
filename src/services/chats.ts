import { supabase } from './supabase';
import type { Chat, ChatListFilters } from '../types';

export async function getChats(filters?: ChatListFilters): Promise<Chat[]> {
  let query = supabase
    .from('chats')
    .select(`
      *,
      client:clients(id, name, phone, status),
      employee:employees(id, name, role),
      unread_count:messages(count)
    `)
    .eq('messages.is_read', false)
    .eq('messages.direction', 'inbound')
    .order('last_message_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.search) {
    query = query.or(
      `client.name.ilike.%${filters.search}%,client.phone.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getChatById(id: string): Promise<Chat | null> {
  const { data, error } = await supabase
    .from('chats')
    .select(`
      *,
      client:clients(*),
      employee:employees(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

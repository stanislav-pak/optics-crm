import { supabase } from './supabase';
import type { Chat, ChatListFilters } from '../types';

export async function getChats(filters?: ChatListFilters): Promise<Chat[]> {
  let query = supabase
    .from('chats')
    .select(`
      *,
      client:clients(id, name, phone, status),
      employee:employees(id, name, role)
    `)
    .order('last_message_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.branch_id) query = query.eq('branch_id', filters.branch_id);
if (filters?.employee_id) query = query.eq('employee_id', filters.employee_id);
  if (filters?.search) {
    query = query.or(
      `client.name.ilike.%${filters.search}%,client.phone.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const chats = data ?? [];

  if (chats.length > 0) {
    const chatIds = chats.map((c: any) => c.id);
    const { data: unreadData } = await supabase
      .from('messages')
      .select('chat_id')
      .eq('is_read', false)
      .eq('direction', 'inbound')
      .in('chat_id', chatIds);
    const unreadMap: Record<string, number> = {};
    unreadData?.forEach((m: any) => { unreadMap[m.chat_id] = (unreadMap[m.chat_id] || 0) + 1; });
    chats.forEach((chat: any) => { chat.unread_count = unreadMap[chat.id] || 0; });
  }

  return chats;
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


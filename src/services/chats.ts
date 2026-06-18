import { supabase } from './supabase';
import type { Chat, ChatListFilters } from '../types';

export interface ClientSearchResult {
  client: { id: string; name?: string | null; phone: string };
  chatId: string | null;
}

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
    const { data: found } = await supabase
      .from('clients')
      .select('id')
      .or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
    const ids = (found ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) return [];
    query = query.in('client_id', ids);
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

export async function searchClientsForChat(
  search: string,
  branchId: string,
  allBranches: boolean
): Promise<ClientSearchResult[]> {
  let q = supabase
    .from('clients')
    .select('id, name, phone')
    .or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
    .order('name')
    .limit(15);
  if (!allBranches) q = q.eq('branch_id', branchId);

  const { data: clients } = await q;
  if (!clients?.length) return [];

  const ids = clients.map((c: { id: string }) => c.id);
  const { data: chats } = await supabase
    .from('chats')
    .select('id, client_id')
    .in('client_id', ids);

  const chatMap = new Map(chats?.map((ch: { client_id: string; id: string }) => [ch.client_id, ch.id]) ?? []);
  return clients.map((c: { id: string; name?: string | null; phone: string }) => ({
    client: c,
    chatId: chatMap.get(c.id) ?? null,
  }));
}

export async function openOrCreateChat(
  clientId: string,
  branchId: string,
  employeeId: string
): Promise<Chat> {
  const { data: existing } = await supabase
    .from('chats')
    .select('id')
    .eq('client_id', clientId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let chatId: string;
  if (existing) {
    chatId = existing.id;
  } else {
    const { data: newChat, error } = await supabase
      .from('chats')
      .insert({
        client_id: clientId,
        employee_id: employeeId,
        branch_id: branchId,
        status: 'active',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error || !newChat) throw new Error('Ошибка создания чата');
    chatId = newChat.id;
  }

  const { data: fullChat } = await supabase
    .from('chats')
    .select('*, client:clients(*), employee:employees(*)')
    .eq('id', chatId)
    .single();
  if (!fullChat) throw new Error('Ошибка загрузки чата');
  return fullChat as Chat;
}

export async function createClientAndChat(
  phone: string,
  name: string | undefined,
  branchId: string,
  employeeId: string
): Promise<Chat> {
  const { data: newClient, error } = await supabase
    .from('clients')
    .insert({
      phone,
      name: name ?? null,
      branch_id: branchId,
      status: 'new',
      contact_type: 'whatsapp',
      first_contact_date: new Date().toISOString(),
      last_contact_date: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !newClient) throw new Error('Ошибка создания клиента');
  return openOrCreateChat(newClient.id, branchId, employeeId);
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


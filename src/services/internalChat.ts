import { supabase } from './supabase';

// ============================================
// ТИПЫ
// ============================================

export interface InternalChat {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  members?: InternalChatMember[];
  last_message?: InternalMessage;
  unread_count?: number;
}

export interface InternalChatMember {
  id: string;
  chat_id: string;
  employee_id: string;
  last_read_at?: string;
  employee?: { id: string; name: string; role: string; branch_id: string };
}

export interface InternalMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: { id: string; name: string };
}

// ============================================
// ФУНКЦИИ
// ============================================

export async function getMyInternalChats(employeeId: string): Promise<InternalChat[]> {
  const { data, error } = await supabase.rpc('get_my_internal_chats', {
    p_employee_id: employeeId
  });
  if (error) { console.error('getMyInternalChats error:', error); return []; }
  return (data as InternalChat[]) || [];
}

export async function getOrCreateDirectChat(
  myEmployeeId: string,
  otherEmployeeId: string
): Promise<InternalChat | null> {
  try {
    const { data: chatId, error: rpcError } = await supabase
      .rpc('create_or_get_direct_chat', {
        p_employee1_id: myEmployeeId,
        p_employee2_id: otherEmployeeId
      });
    if (rpcError || !chatId) {
      console.error('create_or_get_direct_chat error:', rpcError);
      return null;
    }
    const { data: chatData, error: fetchError } = await supabase
      .rpc('get_internal_chat_data', { p_chat_id: chatId });
    if (fetchError || !chatData) {
      console.error('get_internal_chat_data error:', fetchError);
      return null;
    }
    return chatData as InternalChat;
  } catch (e) {
    console.error('getOrCreateDirectChat error:', e);
    return null;
  }
}

export async function createGroupChat(
  name: string,
  memberIds: string[],
  createdBy: string
): Promise<InternalChat> {
  const { data: chat, error: chatError } = await supabase
    .from('internal_chats')
    .insert({ type: 'group', name, created_by: createdBy })
    .select()
    .single();

  if (chatError) throw chatError;

  const { error: membersError } = await supabase
    .from('internal_chat_members')
    .insert(memberIds.map(employeeId => ({ chat_id: chat.id, employee_id: employeeId })));

  if (membersError) throw membersError;

  return chat as InternalChat;
}

export async function getInternalMessages(
  chatId: string,
  limit = 50
): Promise<InternalMessage[]> {
  const { data, error } = await supabase
    .from('internal_messages')
    .select('*, sender:employees(id, name)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as InternalMessage[];
}

export async function sendInternalMessage(
  chatId: string,
  senderId: string,
  content: string
): Promise<InternalMessage> {
  const { data: message, error: msgError } = await supabase
    .from('internal_messages')
    .insert({ chat_id: chatId, sender_id: senderId, content })
    .select('*, sender:employees(id, name)')
    .single();

  if (msgError) throw msgError;

  // Обновляем updated_at чата
  await supabase
    .from('internal_chats')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', chatId);

  // Обновляем last_read_at для отправителя
  await supabase
    .from('internal_chat_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('employee_id', senderId);

  return message as InternalMessage;
}

export async function markAsRead(chatId: string, employeeId: string): Promise<void> {
  const { error } = await supabase
    .from('internal_chat_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('employee_id', employeeId);

  if (error) throw error;
}

export async function getAllEmployees(): Promise<
  { id: string; name: string; role: string; branch_id: string; branch_name: string }[]
> {
  const { data } = await supabase.rpc('get_employees_for_chat');
  return (data || []) as { id: string; name: string; role: string; branch_id: string; branch_name: string }[];
}

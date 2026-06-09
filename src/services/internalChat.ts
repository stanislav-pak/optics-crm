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
  // 1. Получаем все chat_id где текущий сотрудник является участником
  const { data: memberRows, error: memberError } = await supabase
    .from('internal_chat_members')
    .select('chat_id, last_read_at')
    .eq('employee_id', employeeId);

  if (memberError) throw memberError;
  if (!memberRows || memberRows.length === 0) return [];

  const chatIds = memberRows.map(r => r.chat_id as string);

  // 2. Загружаем чаты с участниками
  const { data: chats, error: chatsError } = await supabase
    .from('internal_chats')
    .select(`
      *,
      members:internal_chat_members(
        id, chat_id, employee_id, last_read_at,
        employee:employees(id, name, role, branch_id)
      )
    `)
    .in('id', chatIds);

  if (chatsError) throw chatsError;
  if (!chats) return [];

  // 3 & 4. Для каждого чата загружаем последнее сообщение и считаем unread
  const enriched = await Promise.all(
    (chats as InternalChat[]).map(async chat => {
      const { data: messages } = await supabase
        .from('internal_messages')
        .select('*, sender:employees(id, name)')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastMessage = messages?.[0] as InternalMessage | undefined;

      const myMember = memberRows.find(r => r.chat_id === chat.id);
      const lastReadAt = myMember?.last_read_at ?? null;

      let unreadCount = 0;
      if (lastReadAt) {
        const { count } = await supabase
          .from('internal_messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .neq('sender_id', employeeId)
          .gt('created_at', lastReadAt);
        unreadCount = count ?? 0;
      } else {
        const { count } = await supabase
          .from('internal_messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .neq('sender_id', employeeId);
        unreadCount = count ?? 0;
      }

      return {
        ...chat,
        last_message: lastMessage,
        unread_count: unreadCount,
      } as InternalChat;
    })
  );

  // 5. Сортируем по дате последнего сообщения (desc)
  return enriched.sort((a, b) => {
    const aTime = a.last_message?.created_at ?? a.updated_at;
    const bTime = b.last_message?.created_at ?? b.updated_at;
    return bTime.localeCompare(aTime);
  });
}

export async function getOrCreateDirectChat(
  myEmployeeId: string,
  otherEmployeeId: string
): Promise<InternalChat> {
  // 1. Ищем существующий direct-чат где оба являются участниками
  const { data: myChats } = await supabase
    .from('internal_chat_members')
    .select('chat_id')
    .eq('employee_id', myEmployeeId);

  const { data: otherChats } = await supabase
    .from('internal_chat_members')
    .select('chat_id')
    .eq('employee_id', otherEmployeeId);

  const myChatIds = new Set((myChats ?? []).map(r => r.chat_id as string));
  const sharedChatIds = (otherChats ?? [])
    .map(r => r.chat_id as string)
    .filter(id => myChatIds.has(id));

  if (sharedChatIds.length > 0) {
    const { data: existing } = await supabase
      .from('internal_chats')
      .select('*')
      .in('id', sharedChatIds)
      .eq('type', 'direct')
      .limit(1)
      .single();

    if (existing) {
      return existing as InternalChat;
    }
  }

  // 2. Создаём новый direct-чат
  const { data: newChat, error: chatError } = await supabase
    .from('internal_chats')
    .insert({ type: 'direct', created_by: myEmployeeId })
    .select()
    .single();

  if (chatError) throw chatError;

  const { error: membersError } = await supabase
    .from('internal_chat_members')
    .insert([
      { chat_id: newChat.id, employee_id: myEmployeeId },
      { chat_id: newChat.id, employee_id: otherEmployeeId },
    ]);

  if (membersError) throw membersError;

  return newChat as InternalChat;
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
  { id: string; name: string; role: string; branch_id: string }[]
> {
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, role, branch_id')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return (data ?? []) as { id: string; name: string; role: string; branch_id: string }[];
}

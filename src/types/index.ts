// src/types/index.ts

export type UserRole = 'manager' | 'branch_admin' | 'admin';

export interface Branch {
  id: string;
  name: string;
  city: string;
  address?: string;
  phone?: string;
  waba_phone_id?: string;
  created_at: string;
}

export interface Employee {
  id: string;
  user_id: string;
  branch_id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: Branch;
}

export interface Client {
  id: string;
  branch_id: string;
  phone: string;
  name?: string;
  email?: string;
  status: 'new' | 'in_progress' | 'deal' | 'paid' | 'closed';
  contact_type: 'whatsapp' | 'call' | 'visit';
  first_contact_date?: string;
  last_contact_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  employee_id: string;
  client_id: string;
  branch_id: string;
  waba_conversation_id?: string;
  status: 'active' | 'archived' | 'closed';
  last_message_at?: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  employee?: Employee;
  client?: Client;
  unread_count?: number;
}

export interface Message {
  id: string;
  chat_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'client' | 'employee';
  sender_id?: string;
  content: string;
  message_type: 'text' | 'image' | 'file' | 'template';
  media_url?: string;
  waba_message_id?: string;
  is_read: boolean;
  created_at: string;
  // Relations
  sender?: Employee;
}

export interface Task {
  id: string;
  chat_id: string;
  employee_id: string;
  title: string;
  description?: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'completed' | 'cancelled';
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  chat_id: string;
  employee_id: string;
  text: string;
  remind_at: string;
  is_sent: boolean;
  sent_at?: string;
  created_at: string;
}

export interface Comment {
  id: string;
  chat_id: string;
  employee_id: string;
  text: string;
  created_at: string;
  updated_at: string;
  // Relations
  employee?: Employee;
}

export interface DealStage {
  id: string;
  chat_id: string;
  current_stage: 'new' | 'negotiation' | 'quote' | 'payment' | 'closed';
  moved_to_stage_at: string;
  moved_by_id: string;
  notes?: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  employee_id: string;
  chat_id: string;
  action: string;
  details?: Record<string, any>;
  created_at: string;
}

// Auth related
export interface AuthUser {
  id: string;
  email: string;
  employee?: Employee;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

// API Responses
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// WABA related
export interface WABAMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          type: string;
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
        }>;
      };
    }>;
  }>;
}

// UI State
export interface ChatListFilters {
  branch_id?: string;
  employee_id?: string;
  status?: 'active' | 'archived' | 'closed';
  search?: string;
  sort_by?: 'last_message' | 'created_at' | 'name';
}

export interface DealStats {
  total_chats: number;
  new: number;
  in_progress: number;
  deals: number;
  paid: number;
  closed: number;
  conversion_rate: number;
}

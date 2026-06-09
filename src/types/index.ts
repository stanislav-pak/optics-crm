// src/types/index.ts

export type UserRole = 'manager' | 'branch_admin' | 'admin';

export interface Branch {
  id: string;
  name: string;
  city: string;
  address?: string;
  phone?: string;
  waba_phone_id?: string;
  is_warehouse?: boolean;
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
  archive_after?: string;   // ISO timestamp; set by trigger when deal moves to 'closed'
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
  message_type: 'text' | 'image' | 'file' | 'template' | 'audio';
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

// ============================================
// ����� / INVENTORY
// ============================================

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parent_id?: string;
  branch_id?: string;
  created_at: string;
  // Relations
  parent?: ProductCategory;
  children?: ProductCategory[];
}

export interface Brand {
  id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string;
  brand_id?: string;
  price: number;
  cost_price: number;`n  unit?: string;
  min_stock: number;
  unit: string;
  attributes: ProductAttributes;
  is_active: boolean;
  branch_id?: string;
  created_by?: string;
  created_at: string;
  product_group?: string | null;
  price_policy_id?: string | null;
  // Relations
  category?: ProductCategory;
  brand?: Brand;
  stock?: Stock[];
  price_policy?: { name: string; color: string } | null;
}

// �������� ��� ������ ����� �������
export interface ProductAttributes {
  // �����
  sphere?: number;       // ��������
  cylinder?: number;     // �������
  axis?: number;         // ���
  diameter?: number;     // �������
  base_curve?: number;   // ������� ��������
  // ������/����
  color?: string;
  size?: string;
  material?: string;
  frame_type?: 'full' | 'half' | 'rimless';
  gender?: 'male' | 'female' | 'unisex' | 'kids';
  // �����
  [key: string]: string | number | undefined;
}

export interface Stock {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  updated_at: string;
  // Relations
  product?: Product;
  branch?: Branch;
}

export type StockMovementType = 'in' | 'out' | 'transfer' | 'writeoff' | 'revision_adjust' | 'return';
export type StockMovementStatus = 'in_transit' | 'completed' | 'cancelled';

export interface StockMovement {
  id: string;
  product_id: string;
  branch_id: string;
  type: StockMovementType;
  status?: StockMovementStatus;
  quantity: number;
  price?: number;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  // Transfer fields
  to_branch_id?: string;
  confirmed_quantity?: number;
  confirmed_by?: string;
  confirmed_at?: string;
  discrepancy?: number;
  // Relations
  product?: Product;
  branch?: Branch;
  to_branch?: Branch;
  employee?: Employee;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'confirmed' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  supplier_id?: string;
  branch_id?: string;
  status: PurchaseOrderStatus;
  total: number;
  notes?: string;
  created_by?: string;
  received_at?: string;
  created_at: string;
  // Relations
  supplier?: Supplier;
  branch?: Branch;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id: string;
  quantity: number;
  cost_price: number;`n  unit?: string;
  created_at: string;
  // Relations
  product?: Product;
}

export type PaymentMethod = 'cash' | 'kaspi_qr' | 'mixed';
export type SaleStatus = 'pending' | 'paid' | 'cancelled' | 'refunded' | 'partially_refunded';

export interface Sale {
  id: string;
  branch_id?: string;
  client_id?: string;
  employee_id?: string;
  payment_method?: PaymentMethod;
  status: SaleStatus;
  total: number;
  paid_cash: number;
  paid_kaspi: number;
  fiscal_receipt_number?: string;
  kaspi_payment_id?: string;
  notes?: string;
  created_at: string;
  // Relations
  branch?: Branch;
  client?: Client;
  employee?: Employee;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  price: number;
  created_at: string;
  // Relations
  product?: Product;
}

export type RevisionStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export interface Revision {
  id: string;
  branch_id?: string;
  status: RevisionStatus;
  notes?: string;
  created_by?: string;
  completed_at?: string;
  created_at: string;
  // Relations
  branch?: Branch;
  items?: RevisionItem[];
}

export interface RevisionItem {
  id: string;
  revision_id: string;
  product_id: string;
  expected_qty: number;
  actual_qty?: number;
  difference?: number;
  created_at: string;
  // Relations
  product?: Product;
}

// UI helpers
export interface StockAlert {
  product: Product;
  current_qty: number;
  min_stock: number;
  branch: Branch;
}

export interface InventoryStats {
  total_products: number;
  total_skus: number;
  low_stock_count: number;
  total_value: number;
  movements_today: number;
}

// ============================================
// МАСТЕРСКАЯ / WORKSHOP
// ============================================

export interface Service {
  id: string;
  branch_id: string | null; // null = общая услуга для всех филиалов
  name: string;
  description?: string;
  price: number;
  duration_minutes?: number;
  is_active: boolean;
  created_at: string;
}

export type ServiceOrderStatus =
  'new' | 'in_progress' | 'ready' | 'confirmed' | 'done' | 'cancelled';

export interface ServiceOrder {
  id: string;
  branch_id: string;
  created_branch_id: string;
  client_name: string;
  client_phone?: string;
  employee_id: string;
  service_id?: string;
  service_name: string;
  status: ServiceOrderStatus;
  service_price: number;
  parts_price: number;
  price: number;           // устаревшее, оставлено для совместимости
  prepayment: number;
  original_prepayment: number; // оригинальная предоплата при создании заказа
  payment_type: 'prepaid' | 'full' | 'on_delivery';
  prepayment_method?: 'cash' | 'kaspi';
  prepayment_paid_at?: string;
  notes?: string;
  sale_id?: string;
  estimated_ready_at?: string;
  completed_at?: string;
  remaining_payment_method?: 'cash' | 'kaspi';
  remaining_paid_at?: string;
  prepayment_refunded_at?: string;
  prepayment_refund_method?: 'cash' | 'kaspi';
  previous_status?: string; // для восстановления после отмены
  created_at: string;
  updated_at: string;
  // relations
  employee?: Employee;
  service?: Service;
  created_branch?: { name: string };
}


import { supabase } from './supabase';

export type OrderStatus = 'new' | 'confirmed' | 'awaiting' | 'ready' | 'completed' | 'cancelled';
export type OrderPaymentType = 'none' | 'prepaid' | 'full';

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  branch_id: string;
  client_id?: string | null;
  client_name?: string;
  client_phone?: string;
  status: OrderStatus;
  payment_type: OrderPaymentType;
  prepayment_amount: number;
  prepayment_method?: 'cash' | 'kaspi' | null;
  prepayment_paid_at?: string | null;
  total_amount: number;
  source_branch_id?: string | null;
  notes?: string;
  expected_date?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  branch?: { name: string };
  source_branch?: { name: string };
  creator?: { name: string };
}

export interface CreateOrderData {
  branch_id: string;
  client_name?: string;
  client_phone?: string;
  client_id?: string | null;
  payment_type: OrderPaymentType;
  prepayment_amount?: number;
  prepayment_method?: 'cash' | 'kaspi' | null;
  total_amount: number;
  source_branch_id?: string | null;
  notes?: string;
  expected_date?: string | null;
  created_by: string;
  items: OrderItem[];
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Новый',
  confirmed: 'Подтверждён',
  awaiting: 'Ожидание',
  ready: 'Готов',
  completed: 'Выполнен',
  cancelled: 'Отменён',
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  new: '#8696a0',
  confirmed: '#3b82f6',
  awaiting: '#f59e0b',
  ready: '#10b981',
  completed: '#6b7280',
  cancelled: '#ef4444',
};

function mapRow(row: any): Order {
  return {
    ...row,
    branch: row.branch ?? row['branches!orders_branch_id_fkey'] ?? undefined,
    source_branch: row.source_branch ?? row['branches!orders_source_branch_id_fkey'] ?? undefined,
    creator: row.creator ?? row['employees!orders_created_by_fkey'] ?? undefined,
    items: row.order_items ?? row.items ?? undefined,
  };
}

export async function getOrders(branchId?: string): Promise<Order[]> {
  let query = supabase
    .from('orders')
    .select(`
      *,
      branch:branches!orders_branch_id_fkey(name),
      source_branch:branches!orders_source_branch_id_fkey(name),
      creator:employees!orders_created_by_fkey(name)
    `)
    .order('created_at', { ascending: false });

  if (branchId) query = query.eq('branch_id', branchId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function getOrderById(id: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      branch:branches!orders_branch_id_fkey(name),
      source_branch:branches!orders_source_branch_id_fkey(name),
      creator:employees!orders_created_by_fkey(name),
      items:order_items(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return mapRow(data);
}

export async function createOrder(data: CreateOrderData): Promise<Order> {
  const { items, ...orderPayload } = data;

  const { data: newOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      ...orderPayload,
      prepayment_amount: orderPayload.prepayment_amount ?? 0,
    })
    .select('id')
    .single();

  if (orderError) throw orderError;
  const newId: string = newOrder.id;

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(
        items.map(item => ({
          order_id: newId,
          product_id: item.product_id ?? null,
          product_name: item.product_name,
          quantity: item.quantity,
          price: item.price,
        }))
      );
    if (itemsError) throw itemsError;
  }

  return getOrderById(newId);
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

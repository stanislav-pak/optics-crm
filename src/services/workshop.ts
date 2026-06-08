import { supabase } from './supabase';
import type { Service, ServiceOrder, ServiceOrderStatus } from '../types';

const WORKSHOP_BRANCH_ID = '1104bc27-07bb-4930-93b2-19a2d92b71c9';

async function notifyBranch(branchId: string, title: string, body: string) {
  try {
    await supabase.functions.invoke('send-push', {
      body: { branch_id: branchId, title, body },
    });
  } catch (e) {
    console.error('notifyBranch error:', e);
  }
}

// Если branchId === null — загружаем все активные услуги (branch_id IS NULL + все филиалы).
// Если branchId — строка — загружаем общие + для конкретного филиала.
export async function fetchServices(branchId: string | null): Promise<Service[]> {
  let query = supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (branchId !== null) {
    query = query.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Service[];
}

// fetchServiceOrders с учётом роли:
// - admin: видит все заказы (опционально фильтр по branchId)
// - мастер (employeeBranchId === WORKSHOP_BRANCH_ID): видит заказы по branch_id = мастерская
// - менеджер: видит заказы по created_branch_id = его филиал
export async function fetchServiceOrders(
  branchId: string | null,
  role: string,
  employeeBranchId: string,
  filters?: { status?: ServiceOrderStatus }
): Promise<{ data: ServiceOrder[] | null; error: string | null }> {
  let query = supabase
    .from('service_orders')
    .select('*, employee:employees(id, name), service:services(id, name), created_branch:branches!service_orders_created_branch_id_fkey(name)')
    .order('created_at', { ascending: false });

  if (role === 'admin') {
    // Admin видит все, опционально фильтр по выбранному филиалу
    if (branchId) query = query.eq('branch_id', branchId);
  } else if (employeeBranchId === WORKSHOP_BRANCH_ID) {
    // Мастер видит все заказы направленные в мастерскую
    query = query.eq('branch_id', WORKSHOP_BRANCH_ID);
  } else {
    // Менеджер видит заказы созданные его филиалом
    query = query.eq('created_branch_id', employeeBranchId);
  }

  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data: data as ServiceOrder[], error: null };
}

// Заказы, созданные конкретным филиалом (для менеджерского вида).
export async function fetchOrdersByCreatedBranch(
  createdBranchId: string
): Promise<ServiceOrder[]> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('*, employee:employees(id, name), service:services(id, name), created_branch:branches!service_orders_created_branch_id_fkey(name)')
    .eq('created_branch_id', createdBranchId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as ServiceOrder[];
}

// Выполненные заказы для журнала.
// branchFilter = created_branch_id для фильтрации; null = все.
export async function fetchCompletedOrders(
  branchFilter?: string | null
): Promise<ServiceOrder[]> {
  let query = supabase
    .from('service_orders')
    .select('*, employee:employees(id, name), service:services(id, name), created_branch:branches!service_orders_created_branch_id_fkey(name)')
    .eq('status', 'done')
    .order('created_at', { ascending: false });

  if (branchFilter) {
    query = query.eq('created_branch_id', branchFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as ServiceOrder[];
}

export async function createServiceOrder(data: {
  branch_id: string;
  created_branch_id: string;
  client_name: string;
  client_phone?: string;
  employee_id: string;
  service_id?: string;
  service_name: string;
  service_price: number;
  parts_price: number;
  prepayment: number;
  payment_type: 'prepaid' | 'full' | 'on_delivery';
  notes?: string;
  sale_id?: string;
  estimated_ready_at?: string;
  prepayment_method?: 'cash' | 'kaspi';
  prepayment_paid_at?: string;
}): Promise<ServiceOrder> {
  const total = data.service_price + data.parts_price;

  // Выносим опциональные поля из spread чтобы не попадали как undefined → null
  const { prepayment_method, prepayment_paid_at, ...rest } = data;

  const insertData: Record<string, unknown> = {
    ...rest,
    price: total, // backward compat
    status: 'new',
    original_prepayment: data.prepayment,
  };

  // Сохраняем метод и дату предоплаты только если предоплата > 0
  if (data.prepayment > 0 && prepayment_method) {
    insertData.prepayment_method = prepayment_method;
    insertData.prepayment_paid_at = prepayment_paid_at ?? new Date().toISOString();
  }

  const { data: order, error } = await supabase
    .from('service_orders')
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;

  // Уведомить мастерскую о новом заказе
  notifyBranch(
    WORKSHOP_BRANCH_ID,
    'Новый заказ!',
    `${data.client_name} — ${data.service_name}`
  ).catch(console.error);

  return order as ServiceOrder;
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
  prepayment?: number
): Promise<{ error: string | null }> {
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'done') {
    updateData.completed_at = new Date().toISOString();
  }

  // prepayment НЕ перезаписываем — он хранит оригинальную предоплату.
  // Доплата фиксируется через remaining_payment_method + remaining_paid_at.

  const { error } = await supabase
    .from('service_orders')
    .update(updateData)
    .eq('id', id);

  if (error) return { error: error.message };

  // Уведомления нужны только для статусов ready и cancelled
  if (status === 'ready' || status === 'cancelled') {
    const { data: orderData } = await supabase
      .from('service_orders')
      .select('client_name, service_name, created_branch_id')
      .eq('id', id)
      .single();

    if (orderData) {
      if (status === 'ready' && orderData.created_branch_id) {
        notifyBranch(
          orderData.created_branch_id,
          'Заказ готов!',
          `${orderData.client_name} — ${orderData.service_name} готов к выдаче`
        ).catch(console.error);
      }

      if (status === 'cancelled') {
        notifyBranch(
          WORKSHOP_BRANCH_ID,
          'Заказ отменён',
          `${orderData.client_name} — ${orderData.service_name}`
        ).catch(console.error);
      }
    }
  }

  return { error: null };
}

export async function createService(
  data: Omit<Service, 'id' | 'created_at'>
): Promise<{ data: Service | null; error: string | null }> {
  const { data: service, error } = await supabase
    .from('services')
    .insert(data)
    .select()
    .single();
  if (error) return { data: null, error: error.message ?? 'Ошибка создания услуги' };
  return { data: service as Service, error: null };
}

export async function updateService(
  id: string,
  data: Partial<Pick<Service, 'name' | 'price' | 'duration_minutes' | 'is_active'>>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('services')
    .update(data)
    .eq('id', id);
  return { error: error?.message ?? null };
}

// Восстановить отменённый заказ в предыдущий статус.
export async function restoreServiceOrder(
  id: string,
  previousStatus: ServiceOrderStatus
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('service_orders')
    .update({
      status: previousStatus,
      previous_status: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { error: error.message };
  return { error: null };
}

// Получить заказ мастерской по sale_id (для отображения в деталях продажи).
export async function fetchServiceOrderBySaleId(saleId: string): Promise<ServiceOrder | null> {
  const { data, error } = await supabase
    .from('service_orders')
    .select('*, created_branch:branches!service_orders_created_branch_id_fkey(name)')
    .eq('sale_id', saleId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as ServiceOrder | null;
}

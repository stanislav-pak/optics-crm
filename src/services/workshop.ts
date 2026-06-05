import { supabase } from './supabase';
import type { Service, ServiceOrder, ServiceOrderStatus } from '../types';

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

// Если branchId === null — возвращаем заказы всех филиалов (для admin-режима "Все").
// Если branchId — строка — фильтруем по филиалу.
export async function fetchServiceOrders(
  branchId: string | null,
  filters?: { status?: ServiceOrderStatus }
): Promise<ServiceOrder[]> {
  let query = supabase
    .from('service_orders')
    .select('*, employee:employees(id, name), service:services(id, name)')
    .order('created_at', { ascending: false });

  if (branchId !== null) {
    query = query.eq('branch_id', branchId);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as ServiceOrder[];
}

export async function createServiceOrder(
  data: Omit<ServiceOrder, 'id' | 'created_at' | 'updated_at'>
): Promise<ServiceOrder> {
  const { data: order, error } = await supabase
    .from('service_orders')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return order as ServiceOrder;
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus
): Promise<void> {
  const { error } = await supabase
    .from('service_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
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

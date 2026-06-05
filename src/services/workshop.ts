import { supabase } from './supabase';
import type { Service, ServiceOrder, ServiceOrderStatus } from '../types';

export async function fetchServices(branchId: string): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${branchId}`)
    .order('name');
  if (error) throw error;
  return data as Service[];
}

export async function fetchServiceOrders(
  branchId: string,
  filters?: { status?: ServiceOrderStatus }
): Promise<ServiceOrder[]> {
  let query = supabase
    .from('service_orders')
    .select('*, employee:employees(id, name), service:services(id, name)')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

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
): Promise<Service> {
  const { data: service, error } = await supabase
    .from('services')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return service as Service;
}

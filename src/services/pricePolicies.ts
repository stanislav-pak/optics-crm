import { supabase } from './supabase';

export interface PricePolicy {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export async function getPricePolicies(): Promise<PricePolicy[]> {
  const { data } = await supabase
    .from('price_policies')
    .select('*')
    .order('sort_order', { ascending: true });
  return data || [];
}

export async function createPricePolicy(name: string, color: string): Promise<PricePolicy | null> {
  const { data } = await supabase
    .from('price_policies')
    .insert({ name, color })
    .select().single();
  return data;
}

export async function updatePricePolicy(id: string, name: string, color: string): Promise<void> {
  await supabase.from('price_policies').update({ name, color }).eq('id', id);
}

export async function deletePricePolicy(id: string): Promise<void> {
  await supabase.from('price_policies').delete().eq('id', id);
}

export async function getProductGroups(): Promise<string[]> {
  const { data } = await supabase
    .from('products')
    .select('product_group')
    .not('product_group', 'is', null)
    .order('product_group');
  const groups = [...new Set((data || []).map((r: { product_group: string }) => r.product_group))];
  return groups;
}

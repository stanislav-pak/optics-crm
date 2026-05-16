import { supabase } from './supabase';
import type { Employee } from '../types';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getCurrentEmployee(): Promise<Employee | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('employees')
    .select('*, branch:branches(*)')
    .eq('user_id', user.id)
    .single();

  if (error) return null;
  return data;
}

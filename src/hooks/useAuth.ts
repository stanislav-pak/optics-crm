import { useEffect, useState, createContext, useContext } from 'react';
import { supabase } from '../services/supabase';
import { getCurrentEmployee } from '../services/auth';
import type { Employee } from '../types';

interface AuthContextType {
  employee: Employee | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  employee: null,
  loading: true,
  refetch: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthProvider(): AuthContextType {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmployee = async () => {
    try {
      const emp = await getCurrentEmployee();
      if (emp && !emp.is_active) {
        await supabase.auth.signOut();
        setEmployee(null);
        alert('Ваш аккаунт ожидает подтверждения руководителя.');
      } else {
        setEmployee(emp);
      }
    } catch {
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployee();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') fetchEmployee();
      if (event === 'SIGNED_OUT') {
        setEmployee(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { employee, loading, refetch: fetchEmployee };
}

import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import {
  fetchOrdersByCreatedBranch,
  updateServiceOrderStatus,
} from '../../services/workshop';
import type { ServiceOrder, ServiceOrderStatus } from '../../types';
import ServiceOrderCard from './ServiceOrderCard';

interface Props {
  branchId: string;     // филиал менеджера (created_branch_id)
  employeeId: string;
  role: 'manager' | 'branch_admin' | 'admin';
}

export default function WorkshopManagerView({ branchId, role }: Props) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, [branchId]);

  // Realtime — следим за заказами этого филиала (по created_branch_id)
  useEffect(() => {
    const channel = supabase
      .channel(`workshop-manager-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders' },
        () => { loadOrders(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [branchId]);

  const VISIBLE_STATUSES: ServiceOrderStatus[] = ['ready', 'confirmed'];

  async function loadAll() {
    setLoading(true);
    try {
      const ord = await fetchOrdersByCreatedBranch(branchId);
      setOrders(ord.filter(o => VISIBLE_STATUSES.includes(o.status)));
    } catch (e) {
      console.error('WorkshopManagerView loadAll:', e);
    }
    setLoading(false);
  }

  async function loadOrders() {
    try {
      const ord = await fetchOrdersByCreatedBranch(branchId);
      setOrders(ord.filter(o => VISIBLE_STATUSES.includes(o.status)));
    } catch (e) {
      console.error('WorkshopManagerView loadOrders:', e);
    }
  }

  async function handleStatusChange(id: string, status: ServiceOrderStatus, prepayment?: number) {
    const { error } = await updateServiceOrderStatus(id, status, prepayment);
    if (error) {
      console.error('handleStatusChange:', error);
      return;
    }
    setOrders(prev => prev.map(o =>
      o.id === id
        ? { ...o, status, ...(prepayment !== undefined ? { prepayment } : {}) }
        : o
    ));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">

      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">Услуги мастерской</h1>
      </div>

      {/* Список заказов */}
      <div className="flex-1 overflow-y-auto pb-20 p-4 space-y-3">
        {orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
            <p className="text-4xl mb-3">🔧</p>
            <p className="text-sm font-medium text-gray-700">Заказов нет</p>
            <p className="text-xs text-gray-400 mt-1">Нет заказов готовых к выдаче</p>
          </div>
        ) : (
          orders.map(order => (
            <ServiceOrderCard
              key={order.id}
              order={order}
              viewerBranchId={branchId}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>

    </div>
  );
}

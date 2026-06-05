import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../services/supabase';
import { fetchServices, fetchServiceOrders, updateServiceOrderStatus } from '../services/workshop';
import type { Service, ServiceOrder, ServiceOrderStatus } from '../types';
import AddServiceOrderModal from '../components/Workshop/AddServiceOrderModal';
import ServiceOrderCard from '../components/Workshop/ServiceOrderCard';

interface WorkshopPageProps {
  branchId: string;
  employeeId: string;
  role: 'manager' | 'branch_admin' | 'admin';
}

type StatusFilter = 'all' | ServiceOrderStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',        label: 'Все' },
  { value: 'new',        label: 'Новые' },
  { value: 'in_progress',label: 'В работе' },
  { value: 'ready',      label: 'Готовы' },
  { value: 'done',       label: 'Выданы' },
  { value: 'cancelled',  label: 'Отменены' },
];

export default function WorkshopPage({ branchId, employeeId, role }: WorkshopPageProps) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState(branchId);
  const [allBranches, setAllBranches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => { setActiveBranchId(branchId); }, [branchId]);

  useEffect(() => {
    if (role === 'admin') {
      supabase.from('branches').select('id, name').order('name').then(({ data }) => {
        if (data) setAllBranches(data);
      });
    }
  }, [role]);

  useEffect(() => {
    loadAll();
  }, [activeBranchId]);

  // Realtime-подписка на заказы мастерской
  useEffect(() => {
    const channel = supabase
      .channel(`workshop-orders-${activeBranchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders', filter: `branch_id=eq.${activeBranchId}` },
        () => { loadOrders(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeBranchId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [ord, svc] = await Promise.all([
        fetchServiceOrders(activeBranchId),
        fetchServices(activeBranchId),
      ]);
      setOrders(ord);
      setServices(svc);
    } catch (e) {
      console.error('WorkshopPage loadAll:', e);
    }
    setLoading(false);
  }

  async function loadOrders() {
    try {
      const ord = await fetchServiceOrders(activeBranchId);
      setOrders(ord);
    } catch (e) {
      console.error('WorkshopPage loadOrders:', e);
    }
  }

  async function handleStatusChange(id: string, status: ServiceOrderStatus) {
    try {
      await updateServiceOrderStatus(id, status);
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } catch (e) {
      console.error('handleStatusChange:', e);
    }
  }

  const filteredOrders = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === statusFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Branch switcher для admin */}
      {role === 'admin' && allBranches.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0">
          {allBranches.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBranchId(b.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeBranchId === b.id
                  ? 'bg-purple-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold text-gray-900">Мастерская</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 active:bg-purple-800"
          >
            <Plus size={16} />
            Новый заказ
          </button>
        </div>

        {/* Фильтр по статусу */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {STATUS_FILTERS.map(f => {
            const count = f.value !== 'all' ? orders.filter(o => o.status === f.value).length : orders.length;
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className={`ml-1 ${statusFilter === f.value ? 'opacity-80' : 'opacity-50'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Список заказов */}
      <div className="p-4 space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
            <p className="text-4xl mb-3">🔧</p>
            <p className="text-sm font-medium text-gray-700">Заказов нет</p>
            <p className="text-xs text-gray-400 mt-1">
              {statusFilter === 'all'
                ? 'Нажмите «+ Новый заказ» чтобы добавить'
                : `Нет заказов со статусом «${STATUS_FILTERS.find(f => f.value === statusFilter)?.label}»`}
            </p>
          </div>
        ) : (
          filteredOrders.map(order => (
            <ServiceOrderCard
              key={order.id}
              order={order}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>

      {showAddModal && (
        <AddServiceOrderModal
          branchId={activeBranchId}
          employeeId={employeeId}
          services={services}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

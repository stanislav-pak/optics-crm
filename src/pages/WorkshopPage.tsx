import { useState, useEffect } from 'react';
import { Plus, Settings } from 'lucide-react';
import { supabase } from '../services/supabase';
import { fetchServices, fetchServiceOrders, fetchCompletedOrders, updateServiceOrderStatus } from '../services/workshop';
import type { Service, ServiceOrder, ServiceOrderStatus } from '../types';
import AddServiceOrderModal from '../components/Workshop/AddServiceOrderModal';
import ServiceOrderCard from '../components/Workshop/ServiceOrderCard';
import ServicesManager from '../components/Workshop/ServicesManager';

const WORKSHOP_BRANCH_ID = '1104bc27-07bb-4930-93b2-19a2d92b71c9';

interface WorkshopPageProps {
  branchId: string | null; // null = admin «Все»
  employeeId: string;
  role: 'manager' | 'branch_admin' | 'admin';
  onBack?: () => void;
}

type StatusFilter = 'all' | ServiceOrderStatus;
type PageTab = 'orders' | 'journal';

const ADMIN_BRANCHES = [
  { id: 'ff42784a-5de9-458e-baf6-1ca3c8d0b79f', name: 'Жандосова' },
  { id: '1b9d7882-be86-4559-832b-14817dfcaaa3', name: 'Гум' },
  { id: '67138bd7-d688-47cf-a9c9-51cf800712ad', name: 'Абая 34' },
  { id: '1104bc27-07bb-4930-93b2-19a2d92b71c9', name: 'Мастерская' },
  { id: '30c0cd70-5f43-4201-9f6e-4d67d9aafc2f', name: 'Kaspi' },
] as const;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all',         label: 'Все' },
  { value: 'new',         label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'ready',       label: 'Готовы' },
  { value: 'confirmed',   label: 'Подтверждено' },
  { value: 'done',        label: 'Выданы' },
  { value: 'cancelled',   label: 'Отменены' },
];

export default function WorkshopPage({ branchId, employeeId, role, onBack }: WorkshopPageProps) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<ServiceOrder[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pageTab, setPageTab] = useState<PageTab>('orders');
  const [journalBranchFilter, setJournalBranchFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showServicesManager, setShowServicesManager] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(branchId);
  const [readOrderIds, setReadOrderIds] = useState<Set<string>>(new Set());

  // Кол-во новых непрочитанных заказов (status === 'new', ещё не открытых мастером)
  const badgeCount = orders.filter(o => o.status === 'new' && !readOrderIds.has(o.id)).length;

  useEffect(() => { setSelectedBranch(branchId); }, [branchId]);

  useEffect(() => {
    loadAll();
  }, [selectedBranch]);

  useEffect(() => {
    if (pageTab === 'journal') loadCompleted();
  }, [pageTab, journalBranchFilter]);

  // Realtime
  useEffect(() => {
    const channelName = selectedBranch
      ? `workshop-orders-${selectedBranch}`
      : 'workshop-orders-all';

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        selectedBranch !== null
          ? { event: '*', schema: 'public', table: 'service_orders', filter: `branch_id=eq.${selectedBranch}` }
          : { event: '*', schema: 'public', table: 'service_orders' },
        () => { loadOrders(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedBranch]);

  // Свайп вправо → onBack
  useEffect(() => {
    if (!onBack) return;
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => { start.x = e.touches[0].clientX; start.y = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      if (document.querySelector('[data-modal="true"]')) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (dx > 60 && dy < 80) onBack();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onBack]);

  // Badge: синхронизируем с OS
  useEffect(() => {
    if (badgeCount > 0) {
      (navigator as any).setAppBadge?.(badgeCount);
    } else {
      (navigator as any).clearAppBadge?.();
    }
  }, [badgeCount]);

  // При возврате фокуса вкладки — очищаем OS badge
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        (navigator as any).clearAppBadge?.();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [result, svc] = await Promise.all([
        fetchServiceOrders(selectedBranch, role, branchId ?? ''),
        fetchServices(selectedBranch),
      ]);
      if (result.error) console.error('fetchServiceOrders:', result.error);
      setOrders(result.data ?? []);
      setServices(svc);
    } catch (e) {
      console.error('WorkshopPage loadAll:', e);
    }
    setLoading(false);
  }

  async function loadOrders() {
    try {
      const result = await fetchServiceOrders(selectedBranch, role, branchId ?? '');
      if (result.error) console.error('fetchServiceOrders:', result.error);
      setOrders(result.data ?? []);
    } catch (e) {
      console.error('WorkshopPage loadOrders:', e);
    }
  }

  async function loadCompleted() {
    try {
      const ord = await fetchCompletedOrders(journalBranchFilter);
      setCompletedOrders(ord);
    } catch (e) {
      console.error('WorkshopPage loadCompleted:', e);
    }
  }

  async function loadServices() {
    try {
      const svc = await fetchServices(selectedBranch);
      setServices(svc);
    } catch (e) {
      console.error('WorkshopPage loadServices:', e);
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

  function handleNewOrder() {
    if (role === 'admin' && selectedBranch === null) {
      alert('Выберите конкретный филиал для добавления заказа');
      return;
    }
    setShowAddModal(true);
  }

  const filteredOrders = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === statusFilter);

  // viewerBranchId для карточек в WorkshopPage — всегда мастерская
  const viewerBranchId = WORKSHOP_BRANCH_ID;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Переключатель филиалов — только для admin */}
      {role === 'admin' && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0">
          <button type="button"
            onClick={() => setSelectedBranch(null)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedBranch === null ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            Все
          </button>
          {ADMIN_BRANCHES.map(b => (
            <button key={b.id} type="button"
              onClick={() => setSelectedBranch(b.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedBranch === b.id ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h1 className="text-xl font-semibold text-gray-900">Мастерская</h1>
          </div>
          <div className="flex items-center gap-2">
            {role === 'admin' && (
              <button onClick={() => setShowServicesManager(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <Settings size={15} />
                Услуги
              </button>
            )}
            {pageTab === 'orders' && (
              <button
                onClick={handleNewOrder}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  role === 'admin' && selectedBranch === null
                    ? 'bg-gray-200 text-gray-400 cursor-default'
                    : 'bg-purple-600 text-white hover:bg-purple-700 active:bg-purple-800'
                }`}>
                <Plus size={16} />
                Новый заказ
              </button>
            )}
          </div>
        </div>

        {/* Вкладки: Заказы | Журнал */}
        <div className="flex gap-1 mb-3">
          {(['orders', 'journal'] as PageTab[]).map(tab => (
            <button key={tab}
              onClick={() => setPageTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                pageTab === tab ? 'bg-purple-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              }`}>
              {tab === 'orders' ? 'Заказы' : 'Журнал'}
            </button>
          ))}
        </div>

        {/* Фильтры статуса — только в «Заказы» */}
        {pageTab === 'orders' && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {STATUS_FILTERS.filter(f => f.value !== 'done').map(f => {
              const count = f.value !== 'all'
                ? orders.filter(o => o.status === f.value).length
                : orders.filter(o => o.status !== 'done').length;
              return (
                <button key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                    statusFilter === f.value ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {f.label}
                  {count > 0 && (
                    <span className={`ml-1 ${statusFilter === f.value ? 'opacity-80' : 'opacity-50'}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Фильтр по филиалу — только в «Журнал» */}
        {pageTab === 'journal' && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setJournalBranchFilter(null)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                journalBranchFilter === null ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              Все
            </button>
            {ADMIN_BRANCHES.filter(b => b.id !== WORKSHOP_BRANCH_ID).map(b => (
              <button key={b.id}
                onClick={() => setJournalBranchFilter(b.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  journalBranchFilter === b.id ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {b.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Список заказов */}
      {pageTab === 'orders' && (
        <div className="p-4 space-y-3">
          {filteredOrders.filter(o => o.status !== 'done').length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
              <p className="text-4xl mb-3">🔧</p>
              <p className="text-sm font-medium text-gray-700">Заказов нет</p>
              <p className="text-xs text-gray-400 mt-1">
                {statusFilter === 'all'
                  ? role === 'admin' && selectedBranch === null
                    ? 'Выберите филиал и нажмите «+ Новый заказ»'
                    : 'Нажмите «+ Новый заказ» чтобы добавить'
                  : `Нет заказов со статусом «${STATUS_FILTERS.find(f => f.value === statusFilter)?.label}»`}
              </p>
            </div>
          ) : (
            filteredOrders
              .filter(o => o.status !== 'done')
              .map(order => {
                const isUnread = order.status === 'new' && !readOrderIds.has(order.id);
                return (
                  <div key={order.id} className="relative"
                    onClick={() => {
                      if (isUnread) setReadOrderIds(prev => new Set([...prev, order.id]));
                    }}>
                    {isUnread && (
                      <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-red-500 rounded-full ring-2 ring-white z-10" />
                    )}
                    <ServiceOrderCard
                      order={order}
                      viewerBranchId={viewerBranchId}
                      onStatusChange={handleStatusChange}
                    />
                  </div>
                );
              })
          )}
        </div>
      )}

      {/* Журнал выполненных заказов */}
      {pageTab === 'journal' && (
        <div className="p-4 space-y-3">
          {completedOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 text-center py-16">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-sm font-medium text-gray-700">Нет выполненных заказов</p>
            </div>
          ) : (
            completedOrders.map(order => (
              <ServiceOrderCard
                key={order.id}
                order={order}
                viewerBranchId={viewerBranchId}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </div>
      )}

      {/* Модал создания */}
      {showAddModal && (selectedBranch !== null || role !== 'admin') && (
        <AddServiceOrderModal
          branchId={selectedBranch ?? WORKSHOP_BRANCH_ID}
          employeeId={employeeId}
          services={services}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadAll();
          }}
        />
      )}

      {/* Управление услугами — только для admin */}
      {showServicesManager && (
        <ServicesManager
          onClose={() => setShowServicesManager(false)}
          onServicesUpdated={loadServices}
        />
      )}
    </div>
  );
}

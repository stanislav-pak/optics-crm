import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { getOrders, updateOrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../services/orders';
import type { Order, OrderStatus } from '../../services/orders';

interface Props {
  branchId: string;
}

const ALL_STATUSES: (OrderStatus | 'all')[] = [
  'all', 'new', 'confirmed', 'awaiting', 'ready', 'completed', 'cancelled',
];

const STATUS_FLOW: OrderStatus[] = [
  'new', 'confirmed', 'awaiting', 'ready', 'completed', 'cancelled',
];

function nextStatuses(current: OrderStatus): OrderStatus[] {
  if (current === 'completed' || current === 'cancelled') return [];
  const idx = STATUS_FLOW.indexOf(current);
  const result: OrderStatus[] = [];
  if (idx >= 0 && idx < STATUS_FLOW.length - 2) result.push(STATUS_FLOW[idx + 1]);
  if (current !== 'cancelled') result.push('cancelled');
  return result.filter(s => s !== current);
}

export default function OrdersListView({ branchId }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getOrders(branchId);
      setOrders(data);
    } catch (e) {
      console.error('OrdersListView load error:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const handler = () => { load(); };
    window.addEventListener('preorder-created', handler);
    return () => window.removeEventListener('preorder-created', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === statusFilter);

  const handleStatusChange = async (order: Order, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(order.id, newStatus);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o));
      setSelectedOrder(prev => prev?.id === order.id ? { ...prev, status: newStatus } : prev);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
  };

  const exportCSV = () => {
    const header = ['Дата', 'Клиент', 'Телефон', 'Товары', 'Сумма', 'Статус', 'Ожидаемая дата', 'Заметки'];
    const rows = filtered.map(o => [
      new Date(o.created_at).toLocaleDateString('ru-RU'),
      o.client_name ?? 'Без клиента',
      o.client_phone ?? '',
      o.items?.map(i => `${i.product_name} ×${i.quantity}`).join('; ') ?? '',
      o.total_amount,
      ORDER_STATUS_LABELS[o.status],
      o.expected_date ? new Date(o.expected_date).toLocaleDateString('ru-RU') : '',
      o.notes ?? '',
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `предзаказы_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">

      {/* Шапка */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h2 className="text-base font-semibold text-gray-900">Предзаказы</h2>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <Download size={13} />
          xlsx
        </button>
      </div>

      {/* Фильтр статусов */}
      <div className="bg-white border-b border-gray-100 px-4 py-2 flex gap-1.5 overflow-x-auto flex-shrink-0">
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: statusFilter === s
                ? (s === 'all' ? '#6b7280' : ORDER_STATUS_COLORS[s])
                : '#f3f4f6',
              color: statusFilter === s ? '#fff' : '#6b7280',
              border: 'none',
            }}
          >
            {s === 'all' ? 'Все' : ORDER_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
            Предзаказов нет
          </div>
        ) : filtered.map(order => {
          const itemsText = order.items && order.items.length > 0
            ? order.items.slice(0, 2).map(i => i.product_name).join(', ') +
              (order.items.length > 2 ? ` + ещё ${order.items.length - 2}` : '')
            : 'Нет товаров';
          return (
            <div
              key={order.id}
              className="bg-white rounded-xl border border-gray-100 p-4 cursor-pointer active:bg-gray-50"
              onClick={() => setSelectedOrder(order)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {order.client_name ?? 'Без клиента'}
                    {order.client_phone && (
                      <span className="font-normal text-gray-400 ml-1.5 text-xs">{order.client_phone}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{itemsText}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(order.created_at).toLocaleDateString('ru-RU')}
                    {order.expected_date && (
                      <span className="ml-1.5 text-amber-500">
                        → {new Date(order.expected_date).toLocaleDateString('ru-RU')}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {order.total_amount > 0 && (
                    <p className="text-sm font-bold text-gray-900">₸{order.total_amount.toLocaleString()}</p>
                  )}
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: ORDER_STATUS_COLORS[order.status] + '22',
                      color: ORDER_STATUS_COLORS[order.status],
                    }}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Детальный sheet */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" data-modal="true">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900">Предзаказ</h3>
              <button onClick={() => setSelectedOrder(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Статус */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Статус</span>
                <span
                  className="text-sm font-medium px-2.5 py-0.5 rounded-full"
                  style={{
                    background: ORDER_STATUS_COLORS[selectedOrder.status] + '22',
                    color: ORDER_STATUS_COLORS[selectedOrder.status],
                  }}
                >
                  {ORDER_STATUS_LABELS[selectedOrder.status]}
                </span>
              </div>

              {/* Клиент */}
              <div>
                <p className="text-xs text-gray-400 mb-1">Клиент</p>
                <p className="text-sm text-gray-900">{selectedOrder.client_name ?? 'Без клиента'}</p>
                {selectedOrder.client_phone && (
                  <p className="text-sm text-gray-500">{selectedOrder.client_phone}</p>
                )}
              </div>

              {/* Товары */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Товары</p>
                  <div className="space-y-1.5">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.product_name} × {item.quantity}</span>
                        {item.price > 0 && (
                          <span className="text-gray-500">₸{(item.price * item.quantity).toLocaleString()}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Суммы */}
              {selectedOrder.total_amount > 0 && (
                <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-2">
                  <span>Итого</span>
                  <span>₸{selectedOrder.total_amount.toLocaleString()}</span>
                </div>
              )}
              {selectedOrder.prepayment_amount > 0 && (
                <div className="flex justify-between text-sm text-amber-600">
                  <span>Предоплата</span>
                  <span>₸{selectedOrder.prepayment_amount.toLocaleString()}</span>
                </div>
              )}

              {/* Даты */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Создан</span>
                  <span className="text-gray-700">
                    {new Date(selectedOrder.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                {selectedOrder.expected_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Ожидается</span>
                    <span className="text-amber-600">
                      {new Date(selectedOrder.expected_date).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                )}
              </div>

              {/* Заметки */}
              {selectedOrder.notes && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Заметки</p>
                  <p className="text-sm text-gray-700">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Кнопки смены статуса */}
              {nextStatuses(selectedOrder.status).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-500">Изменить статус</p>
                  <div className="flex flex-wrap gap-2">
                    {nextStatuses(selectedOrder.status).map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(selectedOrder, s)}
                        className="flex-1 min-w-[120px] py-2 rounded-xl text-sm font-medium transition-colors"
                        style={{
                          background: ORDER_STATUS_COLORS[s] + '22',
                          color: ORDER_STATUS_COLORS[s],
                          border: `1px solid ${ORDER_STATUS_COLORS[s]}44`,
                        }}
                      >
                        → {ORDER_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

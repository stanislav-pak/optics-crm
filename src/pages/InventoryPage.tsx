import { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Search, QrCode, Trash2 } from 'lucide-react';
import {
  getProducts, getStock, getInventoryStats, getLowStockAlerts,
  getStockMovements, getPurchaseOrders, getSales, getRevisions
} from '../services/inventory';
import { supabase } from '../services/supabase';
import type {
  Product, Stock, InventoryStats, StockAlert,
  StockMovement, PurchaseOrder, Sale, Revision
} from '../types';
import AddProductModal from '../components/Inventory/AddProductModal';
import AddPurchaseModal from '../components/Inventory/AddPurchaseModal';

type Tab = 'overview' | 'products' | 'movements' | 'purchases' | 'sales' | 'revisions';

interface InventoryPageProps {
  branchId: string;
  employeeId: string;
  role: 'manager' | 'branch_admin' | 'admin';
}

export default function InventoryPage({ branchId, employeeId, role }: InventoryPageProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);

  useEffect(() => {
    loadAll();
  }, [branchId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, p, st, al, mv, po, sa, rv] = await Promise.all([
        getInventoryStats(branchId),
        getProducts(branchId),
        getStock(branchId),
        getLowStockAlerts(branchId),
        getStockMovements(branchId),
        getPurchaseOrders(branchId),
        getSales(branchId),
        getRevisions(branchId),
      ]);
      setStats(s);
      setProducts(p);
      setStock(st);
      setAlerts(al);
      setMovements(mv);
      setPurchases(po);
      setSales(sa);
      setRevisions(rv);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'products', label: 'Товары' },
    { key: 'movements', label: 'Движения' },
    { key: 'purchases', label: 'Приходы' },
    { key: 'sales', label: 'Продажи' },
    { key: 'revisions', label: 'Ревизии' },
  ];

  async function deletePurchaseOrder(id: string) {
    if (!confirm('Удалить приход? Остатки не будут скорректированы автоматически.')) return;
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
    await supabase.from('purchase_orders').delete().eq('id', id);
    loadAll();
  }

  async function deleteProduct(id: string) {
    if (!confirm('Удалить товар?')) return;
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
    if (!error) loadAll();
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Склад</h1>
          {alerts.length > 0 && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm">
              <AlertTriangle size={16} />
              <span>{alerts.length} товаров заканчивается</span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 mt-4 pb-1 overflow-x-auto -mx-6 px-6">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-1.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {/* ОБЗОР */}
        {tab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Товаров" value={stats.total_products} />
              <StatCard label="Позиций на складе" value={stats.total_skus} />
              <StatCard label="Стоимость склада" value={`₸${stats.total_value.toLocaleString()}`} />
              <StatCard label="Движений сегодня" value={stats.movements_today} />
            </div>

            {alerts.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-3">⚠️ Заканчивается на складе</h2>
                <div className="bg-white rounded-xl border border-red-100 divide-y divide-gray-100">
                  {alerts.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{(a.product as any)?.name}</p>
                        <p className="text-xs text-gray-500">Мин: {(a.product as any)?.min_stock} {(a.product as any)?.unit}</p>
                      </div>
                      <span className="text-red-600 font-semibold text-sm">{a.current_qty} шт</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Последние движения</h2>
              <MovementsTable movements={movements.slice(0, 10)} />
            </div>
          </div>
        )}

        {/* ТОВАРЫ */}
        {tab === 'products' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Поиск по названию, SKU, штрихкоду..."
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {role !== 'manager' && (
                <button
                  onClick={() => setShowAddProduct(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus size={16} />
                  Добавить
                </button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Заголовок таблицы */}
              <div className="flex items-center text-xs font-medium text-gray-500 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span className="flex-1 min-w-0">Товар</span>
                <span className="hidden md:block w-24 text-center">SKU</span>
                <span className="hidden md:block w-32 text-center">Штрихкод</span>
                <span className="w-20 text-right">Цена</span>
                <span className="w-16 text-right">Остаток</span>
                <span className="w-6" />
              </div>
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Товары не найдены</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredProducts.map(p => {
                    const stockItem = stock.find(s => s.product_id === p.id);
                    const isLow = stockItem && stockItem.quantity <= p.min_stock;
                    return (
                      <div key={p.id} className="flex items-center px-4 py-3 hover:bg-gray-50 gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 truncate">{(p.brand as any)?.name} · {(p.category as any)?.name}</p>
                        </div>
                        <span className="hidden md:block w-24 text-center text-xs text-gray-500 font-mono">{p.sku || '—'}</span>
                        <span className="hidden md:block w-32 text-center text-xs text-gray-400 font-mono">{p.barcode || '—'}</span>
                        <span className="w-20 text-sm text-right text-gray-700 flex-shrink-0">₸{p.price.toLocaleString()}</span>
                        <span className={`w-16 text-sm text-right font-medium flex-shrink-0 ${isLow ? 'text-red-500' : 'text-gray-900'}`}>
                          {stockItem?.quantity ?? 0} {p.unit}
                        </span>
                        <div className="w-6 flex justify-end flex-shrink-0">
                          {isLow && <AlertTriangle size={14} className="text-red-400" />}
                        </div>
                        {role !== 'manager' && (
                          <div className="flex-shrink-0">
                            <button
                              onClick={() => deleteProduct(p.id)}
                              className="text-gray-300 hover:text-red-400 p-0.5"
                              title="Удалить товар"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ДВИЖЕНИЯ */}
        {tab === 'movements' && (
          <div className="space-y-4">
            <MovementsTable movements={movements} />
          </div>
        )}

        {/* ПРИХОДЫ */}
        {tab === 'purchases' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowAddPurchase(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                <Plus size={16} />
                Новый приход
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {purchases.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Приходов нет</div>
              ) : purchases.map(po => (
                <div key={po.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{(po.supplier as any)?.name ?? 'Без поставщика'}</p>
                    <p className="text-xs text-gray-400">{new Date(po.created_at).toLocaleDateString('ru-RU')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {po.items?.map(i => (i.product as any)?.name).filter(Boolean).join(', ') || `${po.items?.length ?? 0} позиций`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-gray-900">₸{po.total.toLocaleString()}</p>
                    <StatusBadge status={po.status} />
                  </div>
                  {role !== 'manager' && (
                    <button
                      onClick={() => deletePurchaseOrder(po.id)}
                      className="text-gray-300 hover:text-red-400 flex-shrink-0"
                      title="Удалить приход"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ПРОДАЖИ */}
        {tab === 'sales' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
                <Plus size={16} />
                Новая продажа
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {sales.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Продаж нет</div>
              ) : sales.map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{(s.client as any)?.name ?? (s.client as any)?.phone ?? 'Без клиента'}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(s.created_at).toLocaleDateString('ru-RU')} · {(s.employee as any)?.name} · {
                        s.payment_method === 'cash' ? '💵 Наличные' :
                        s.payment_method === 'kaspi_qr' ? '📱 Kaspi QR' : '💳 Смешанная'
                      }
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">₸{s.total.toLocaleString()}</p>
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* РЕВИЗИИ */}
        {tab === 'revisions' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700">
                <QrCode size={16} />
                Начать ревизию
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {revisions.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Ревизий нет</div>
              ) : revisions.map(r => {
                const items = r.items ?? [];
                const counted = items.filter(i => i.actual_qty != null).length;
                const withDiff = items.filter(i => (i.difference ?? 0) !== 0).length;
                return (
                  <div key={r.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Ревизия от {new Date(r.created_at).toLocaleDateString('ru-RU')}
                      </p>
                      <p className="text-xs text-gray-400">
                        Подсчитано: {counted}/{items.length} · Расхождений: {withDiff}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showAddProduct && (
        <AddProductModal
          branchId={branchId}
          employeeId={employeeId}
          onClose={() => setShowAddProduct(false)}
          onSuccess={loadAll}
        />
      )}
      {showAddPurchase && (
        <AddPurchaseModal
          branchId={branchId}
          employeeId={employeeId}
          onClose={() => setShowAddPurchase(false)}
          onSuccess={loadAll}
        />
      )}
    </div>
  );
}

// ---- Вспомогательные компоненты ----

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function MovementsTable({ movements }: { movements: StockMovement[] }) {
  const typeLabel: Record<string, { label: string; color: string }> = {
    in: { label: 'Приход', color: 'text-green-600' },
    out: { label: 'Расход', color: 'text-red-600' },
    transfer: { label: 'Перемещение', color: 'text-blue-600' },
    writeoff: { label: 'Списание', color: 'text-orange-600' },
    revision_adjust: { label: 'Корректировка', color: 'text-purple-600' },
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-12 text-xs font-medium text-gray-500 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="col-span-4">Товар</span>
        <span className="col-span-3">Тип</span>
        <span className="col-span-2 text-right">Кол-во</span>
        <span className="col-span-3 text-right">Дата</span>
      </div>
      {movements.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Движений нет</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {movements.map(m => {
            const t = typeLabel[m.type] ?? { label: m.type, color: 'text-gray-600' };
            return (
              <div key={m.id} className="grid grid-cols-12 items-center px-4 py-3">
                <div className="col-span-4">
                  <p className="text-sm text-gray-900">{(m.product as any)?.name ?? '—'}</p>
                  <p className="text-xs text-gray-400">{(m.employee as any)?.name ?? '—'}</p>
                </div>
                <span className={`col-span-3 text-sm font-medium ${t.color}`}>{t.label}</span>
                <span className="col-span-2 text-sm text-right text-gray-700">{m.quantity}</span>
                <span className="col-span-3 text-xs text-right text-gray-400">
                  {new Date(m.created_at).toLocaleDateString('ru-RU')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Черновик', className: 'bg-gray-100 text-gray-600' },
    confirmed: { label: 'Подтверждён', className: 'bg-blue-100 text-blue-600' },
    received: { label: 'Получен', className: 'bg-green-100 text-green-600' },
    cancelled: { label: 'Отменён', className: 'bg-red-100 text-red-600' },
    pending: { label: 'Ожидает', className: 'bg-yellow-100 text-yellow-600' },
    paid: { label: 'Оплачено', className: 'bg-green-100 text-green-600' },
    refunded: { label: 'Возврат', className: 'bg-orange-100 text-orange-600' },
    in_progress: { label: 'В процессе', className: 'bg-blue-100 text-blue-600' },
    completed: { label: 'Завершена', className: 'bg-green-100 text-green-600' },
  };

  const s = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

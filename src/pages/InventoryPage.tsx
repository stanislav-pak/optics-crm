import { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Search, QrCode, Trash2, X, Users } from 'lucide-react';
import {
  getProducts, getStock, getInventoryStats, getLowStockAlerts,
  getStockMovements, getPurchaseOrders, getSales, getRevisions,
  deleteRevision, getIncomingTransfers,
} from '../services/inventory';
import { supabase } from '../services/supabase';
import type {
  Product, Stock, InventoryStats, StockAlert,
  StockMovement, PurchaseOrder, Sale, Revision, Branch
} from '../types';
import AddProductModal from '../components/Inventory/AddProductModal';
import AddPurchaseModal from '../components/Inventory/AddPurchaseModal';
import ProductDetailModal from '../components/Inventory/ProductDetailModal';
import EditProductModal from '../components/Inventory/EditProductModal';
import TransferModal from '../components/Inventory/TransferModal';
import BranchDetailModal from '../components/Inventory/BranchDetailModal';
import IncomingTransfersModal from '../components/Inventory/IncomingTransfersModal';
import AddSaleModal from '../components/Inventory/AddSaleModal';
import RevisionModal from '../components/Inventory/RevisionModal';
import SuppliersModal from '../components/Inventory/SuppliersModal';

type Tab = 'overview' | 'products' | 'movements' | 'purchases' | 'sales' | 'revisions';

interface InventoryPageProps {
  branchId: string;
  employeeId: string;
  role: 'manager' | 'branch_admin' | 'admin';
}

export default function InventoryPage({ branchId, employeeId, role }: InventoryPageProps) {
  console.log('InventoryPage mounting', { branchId, employeeId, role });
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

  // Фильтры движений
  const [mvTypeFilter, setMvTypeFilter] = useState<string>('all');
  const [mvDateFilter, setMvDateFilter] = useState<string>('all');
  const [mvDateFrom, setMvDateFrom] = useState('');
  const [mvDateTo, setMvDateTo] = useState('');
  const [mvProductSearch, setMvProductSearch] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showAddSale, setShowAddSale] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [continueRevisionId, setContinueRevisionId] = useState<string | undefined>(undefined);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseOrder | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [repeatPurchaseData, setRepeatPurchaseData] = useState<{ supplier_id?: string; items?: Array<{ product_id: string; quantity: number; cost_price: number }> } | undefined>(undefined);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string; is_warehouse?: boolean }[]>([]);
  const [allBranchesStock, setAllBranchesStock] = useState<{ branch_id: string; quantity: number }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [incomingTransfers, setIncomingTransfers] = useState<any[]>([]);
  const [showIncomingTransfers, setShowIncomingTransfers] = useState(false);

  // Загружаем филиалы один раз при монтировании
  useEffect(() => {
    supabase.from('branches').select('id, name, is_warehouse').order('name').then(({ data }) => {
      if (!data) return;
      const sorted = [...data].sort((a, b) => (b.is_warehouse ? 1 : 0) - (a.is_warehouse ? 1 : 0));
      setBranches(sorted);
    });
  }, []);

  useEffect(() => {
    loadAll();
  }, [branchId]);

  // Принудительный рефреш ревизий при переключении на вкладку
  useEffect(() => {
    if (tab === 'revisions') {
      getRevisions(branchId).then(setRevisions).catch(e => console.error('getRevisions refresh:', e));
    }
  }, [tab]);

  async function loadAll() {
    // Для admin — не фильтруем по филиалу (видит данные всех филиалов)
    const scopeId = role === 'admin' ? undefined : branchId;
    console.log('loadAll START', { branchId, role, scopeId });
    setLoading(true);

    try { const s = await getInventoryStats(scopeId); setStats(s); console.log('getInventoryStats OK', s); }
    catch (e) { console.error('getInventoryStats FAILED:', e); }

    try { const p = await getProducts(scopeId); setProducts(p); console.log('getProducts OK', p.length); }
    catch (e) { console.error('getProducts FAILED:', e); }

    try { const st = await getStock(scopeId); setStock(st); console.log('getStock OK', st.length); }
    catch (e) { console.error('getStock FAILED:', e); }

    try { const al = await getLowStockAlerts(scopeId); setAlerts(al); console.log('getLowStockAlerts OK', al.length); }
    catch (e) { console.error('getLowStockAlerts FAILED:', e); }

    try { const mv = await getStockMovements(scopeId); setMovements(mv); console.log('getStockMovements OK', mv.length); }
    catch (e) { console.error('getStockMovements FAILED:', e); }

    try { const po = await getPurchaseOrders(scopeId); setPurchases(po); console.log('getPurchaseOrders OK', po.length); }
    catch (e) { console.error('getPurchaseOrders FAILED:', e); }

    try { const sa = await getSales(scopeId); setSales(sa); console.log('getSales OK', sa.length); }
    catch (e) { console.error('getSales FAILED:', e); }

    try { const rv = await getRevisions(scopeId); setRevisions(rv); console.log('getRevisions OK', rv.length); }
    catch (e) { console.error('getRevisions FAILED:', e); }

    try {
      const { data: abs } = await supabase.from('stock').select('branch_id, quantity');
      setAllBranchesStock(abs ?? []);
      console.log('allBranchesStock OK', abs?.length);
    } catch (e) { console.error('allBranchesStock FAILED:', e); }

    setLoading(false);
    console.log('loadAll DONE');

    // Входящие перемещения — всегда по конкретному branchId (не scopeId)
    try {
      const incoming = await getIncomingTransfers(branchId);
      setIncomingTransfers(incoming);
      console.log('getIncomingTransfers OK', incoming.length);
    } catch (e) {
      console.error('getIncomingTransfers FAILED:', e);
      setIncomingTransfers([]);
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

  async function handleDeleteRevision(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Удалить ревизию?')) return;
    await deleteRevision(id);
    await loadAll();
  }

  async function deletePurchaseOrder(id: string) {
    if (!confirm('Удалить приход? Остатки не будут скорректированы автоматически.')) return;
    const { error: itemsError } = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
    if (itemsError) { console.error('deletePurchaseOrder items error:', itemsError); return; }
    const { error: poError } = await supabase.from('purchase_orders').delete().eq('id', id);
    if (poError) { console.error('deletePurchaseOrder error:', poError); return; }
    await loadAll();
  }

  async function deleteProduct(id: string) {
    if (!confirm('Удалить товар?')) return;
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
    if (!error) await loadAll();
    else console.error('deleteProduct error:', error);
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  );

  if (loading) {
    return (
      <div>
        <div style={{position:'fixed',top:0,left:0,right:0,background:'red',color:'white',zIndex:9999,padding:'4px',fontSize:'12px'}}>
          INVENTORY LOADING | role:{role} | branchId:{branchId}
        </div>
        <div className="flex items-center justify-center h-64" style={{paddingTop:'24px'}}>
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* DEBUG */}
      <div style={{position:'fixed',top:0,left:0,right:0,background:'red',color:'white',zIndex:9999,padding:'4px',fontSize:'12px'}}>
        INVENTORY LOADED | role:{role} | products:{products.length} | branchId:{branchId}
      </div>
      <div className="bg-yellow-100 p-2 text-xs m-2 rounded" style={{marginTop:'24px'}}>
        role: {role} | branchId: {branchId} | scopeId: {role === 'admin' ? 'undefined' : branchId} | products: {products.length}
      </div>
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
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Товары не найдены</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredProducts.map(p => {
                    const stockItem = stock.find(s => s.product_id === p.id);
                    const qty = stockItem?.quantity ?? 0;
                    const isLow = qty <= p.min_stock;
                    const meta = [
                      (p.category as any)?.name,
                      (p.brand as any)?.name,
                      p.sku,
                      p.barcode,
                    ].filter(Boolean).join(' · ');
                    return (
                      <div key={p.id} className="flex items-center px-4 py-3 hover:bg-gray-50 gap-3 cursor-pointer" onClick={() => setSelectedProduct(p)}>
                        <div className="flex-1 min-w-0">
                          {/* Строка 1: название · цены · остаток */}
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate flex-1">{p.name}</p>
                            <span className="text-sm text-gray-400 flex-shrink-0 tabular-nums">
                              {p.cost_price > 0 ? `${p.cost_price.toLocaleString()}/` : ''}{p.price.toLocaleString()}
                            </span>
                            <span className={`text-sm font-medium flex-shrink-0 tabular-nums ${isLow ? 'text-red-500' : 'text-gray-900'}`}>
                              {qty} {p.unit}
                            </span>
                          </div>
                          {/* Строка 2: мета */}
                          {meta && <p className="text-xs text-gray-400 truncate mt-0.5">{meta}</p>}
                        </div>
                        {role !== 'manager' && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteProduct(p.id); }}
                            className="text-gray-300 hover:text-red-400 flex-shrink-0 p-0.5"
                            title="Удалить товар"
                          >
                            <Trash2 size={14} />
                          </button>
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
        {tab === 'movements' && (() => {
          // Вычисляем даты для быстрых фильтров
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
          const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

          const filteredMovements = movements.filter(m => {
            // Фильтр по типу
            if (mvTypeFilter !== 'all' && m.type !== mvTypeFilter) return false;

            // Фильтр по дате
            const mDate = m.created_at.split('T')[0];
            if (mvDateFilter === 'today' && mDate !== todayStr) return false;
            if (mvDateFilter === 'week' && new Date(mDate) < weekAgo) return false;
            if (mvDateFilter === 'month' && new Date(mDate) < monthAgo) return false;
            if (mvDateFilter === 'custom') {
              if (mvDateFrom && mDate < mvDateFrom) return false;
              if (mvDateTo && mDate > mvDateTo) return false;
            }

            // Фильтр по товару
            if (mvProductSearch) {
              const name = ((m.product as any)?.name ?? '').toLowerCase();
              if (!name.includes(mvProductSearch.toLowerCase())) return false;
            }

            return true;
          });

          const typeOptions: { value: string; label: string }[] = [
            { value: 'all', label: 'Все' },
            { value: 'in', label: 'Приход' },
            { value: 'out', label: 'Продажа' },
            { value: 'writeoff', label: 'Списание' },
            { value: 'transfer', label: 'Перемещение' },
            { value: 'revision_adjust', label: 'Ревизия' },
          ];

          const dateOptions: { value: string; label: string }[] = [
            { value: 'all', label: 'Всё время' },
            { value: 'today', label: 'Сегодня' },
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
            { value: 'custom', label: 'Период' },
          ];

          return (
            <div className="space-y-3">

              {/* Баннер входящих перемещений */}
              {incomingTransfers.length > 0 && (
                <button
                  onClick={() => setShowIncomingTransfers(true)}
                  className="w-full flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-left hover:bg-orange-100 transition-colors"
                >
                  <span className="text-xl flex-shrink-0">📦</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-orange-700">
                      {incomingTransfers.length} входящих перемещений ожидают подтверждения
                    </p>
                    <p className="text-xs text-orange-500 mt-0.5">Нажмите, чтобы подтвердить получение</p>
                  </div>
                  <span className="text-orange-400 flex-shrink-0">›</span>
                </button>
              )}

              {/* Фильтр по типу */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingBottom: '4px' }}>
                {typeOptions.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setMvTypeFilter(o.value)}
                    style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, border: mvTypeFilter === o.value ? 'none' : '1px solid #e5e7eb', backgroundColor: mvTypeFilter === o.value ? '#2563eb' : '#fff', color: mvTypeFilter === o.value ? '#fff' : '#4b5563', cursor: 'pointer' }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Фильтр по дате */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingBottom: '4px' }}>
                {dateOptions.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setMvDateFilter(o.value)}
                    style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, border: mvDateFilter === o.value ? 'none' : '1px solid #e5e7eb', backgroundColor: mvDateFilter === o.value ? '#1f2937' : '#fff', color: mvDateFilter === o.value ? '#fff' : '#4b5563', cursor: 'pointer' }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Произвольный диапазон дат */}
              {mvDateFilter === 'custom' && (
                <div className="flex gap-2 items-center">
                  <input type="date" value={mvDateFrom} onChange={e => setMvDateFrom(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-gray-400 text-sm flex-shrink-0">—</span>
                  <input type="date" value={mvDateTo} onChange={e => setMvDateTo(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {/* Поиск по товару */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={mvProductSearch}
                  onChange={e => setMvProductSearch(e.target.value)}
                  placeholder="Поиск по названию товара..."
                  className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              {/* Счётчик результатов */}
              {(mvTypeFilter !== 'all' || mvDateFilter !== 'all' || mvProductSearch) && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    Найдено: {filteredMovements.length} из {movements.length}
                  </p>
                  <button
                    onClick={() => { setMvTypeFilter('all'); setMvDateFilter('all'); setMvDateFrom(''); setMvDateTo(''); setMvProductSearch(''); }}
                    className="text-xs text-blue-600 hover:underline">
                    Сбросить фильтры
                  </button>
                </div>
              )}

              {/* Сводка остатков по филиалам при фильтре «Перемещение» */}
              {mvTypeFilter === 'transfer' && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700">Остатки по филиалам</h3>
                    {role === 'admin' && (
                      <button
                        onClick={() => setShowTransfer(true)}
                        className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700"
                      >
                        <Plus size={13} />
                        Перемещение
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-gray-50">
                    {branches.map(b => {
                      const total = allBranchesStock
                        .filter(s => s.branch_id === b.id)
                        .reduce((sum, s) => sum + s.quantity, 0);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBranch(b as Branch)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 cursor-pointer text-left"
                        >
                          <span className="text-sm text-gray-700">
                            {b.is_warehouse && <span className="text-xs mr-1.5">🏭</span>}
                            {b.name}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">{total} шт</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <MovementsTable movements={filteredMovements} emptyText="Нет движений по выбранным фильтрам" />
            </div>
          );
        })()}

        {/* ПРИХОДЫ */}
        {tab === 'purchases' && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSuppliers(true)}
                className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-50">
                <Users size={16} />
                Поставщики
              </button>
              <button onClick={() => setShowAddPurchase(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
                <Plus size={16} />
                Новый приход
              </button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {purchases.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">Приходов нет</div>
              ) : purchases.map(po => (
                <div
                  key={po.id}
                  className={`flex items-center gap-3 px-4 py-3 active:bg-gray-100 ${role !== 'manager' ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  onClick={role !== 'manager' ? () => {
                    setRepeatPurchaseData({
                      supplier_id: (po.supplier as any)?.id ?? po.supplier_id,
                      items: po.items?.map(i => ({
                        product_id: i.product_id,
                        quantity: i.quantity,
                        cost_price: i.cost_price,
                      })) ?? [],
                    });
                    setShowAddPurchase(true);
                  } : undefined}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {po.items?.map(i => `${(i.product as any)?.name} (${i.quantity} шт)`).filter(Boolean).join(', ') || `${po.items?.length ?? 0} позиций`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(po.supplier as any)?.name ?? 'Без поставщика'} · {new Date(po.created_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-gray-900">₸{po.total.toLocaleString()}</p>
                    <StatusBadge status={po.status} />
                  </div>
                  {role !== 'manager' && (
                    <button
                      onClick={e => { e.stopPropagation(); deletePurchaseOrder(po.id); }}
                      className="text-gray-300 hover:text-red-400 flex-shrink-0 p-0.5"
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
              <button onClick={() => setShowAddSale(true)} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700">
                <Plus size={16} />
                Новая продажа
              </button>
            </div>
            {sales.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">Продаж нет</div>
            ) : (
              <div className="space-y-3">
                {sales.map(s => (
                  <div key={s.id}
                    className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 cursor-pointer active:bg-gray-50"
                    onClick={() => setSelectedSale(s)}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {(s.client as any)?.name || (s.client as any)?.phone || 'Без клиента'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(s.created_at).toLocaleDateString('ru-RU')} · {(s.employee as any)?.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-gray-900">₸{s.total.toLocaleString()}</p>
                        <StatusBadge status={s.status} />
                      </div>
                    </div>

                    {/* Товары */}
                    <div className="space-y-1">
                      {s.items?.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-gray-500">
                          <span>{(item.product as any)?.name} × {item.quantity}</span>
                          <span>₸{(item.quantity * item.price).toLocaleString()}</span>
                        </div>
                      ))}
                      {(s.items?.length ?? 0) > 3 && (
                        <p className="text-xs text-gray-400">+ ещё {(s.items?.length ?? 0) - 3} позиций</p>
                      )}
                    </div>

                    {/* Оплата */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                      <span className="text-xs text-gray-500">
                        {s.payment_method === 'cash' ? '💵 Наличные' :
                         s.payment_method === 'kaspi_qr' ? '📱 Kaspi QR' : '💳 Смешанная'}
                      </span>
                      {s.paid_cash > 0 && s.paid_kaspi > 0 && (
                        <span className="text-xs text-gray-400">
                          {s.paid_cash.toLocaleString()}₸ + {s.paid_kaspi.toLocaleString()}₸
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* РЕВИЗИИ */}
        {tab === 'revisions' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowRevision(true)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700">
                <QrCode size={16} />
                Начать ревизию
              </button>
            </div>
            {revisions.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">Ревизий нет</div>
            ) : (
              <div className="space-y-3">
                {revisions.map(r => {
                  const ritems = r.items ?? [];
                  const counted = ritems.filter(i => i.actual_qty != null).length;
                  const withDiff = ritems.filter(i => (i.difference ?? 0) !== 0).length;
                  const isInProgress = r.status === 'in_progress';
                  return (
                    <div key={r.id}
                      className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 cursor-pointer active:bg-gray-50"
                      onClick={() => { if (!isInProgress) setSelectedRevision(r); }}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            Ревизия от {new Date(r.created_at).toLocaleDateString('ru-RU')}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Подсчитано: {counted}/{ritems.length} · Расхождений: {withDiff}
                          </p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        {isInProgress ? (
                          <button
                            onClick={e => { e.stopPropagation(); setContinueRevisionId(r.id); setShowRevision(true); }}
                            className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700">
                            Продолжить
                          </button>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedRevision(r); }}
                            className="px-4 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200">
                            Просмотр
                          </button>
                        )}
                        {role !== 'manager' && (
                          <button
                            onClick={e => handleDeleteRevision(r.id, e)}
                            className="p-1.5 text-gray-300 hover:text-red-400">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          stock={stock.find(s => s.product_id === selectedProduct.id)?.quantity ?? 0}
          branchId={branchId}
          onClose={() => setSelectedProduct(null)}
          onEdit={() => { setEditingProduct(selectedProduct); setSelectedProduct(null); }}
          onDelete={async () => {
            await deleteProduct(selectedProduct.id);
            setSelectedProduct(null);
          }}
        />
      )}

      {showTransfer && (
        <TransferModal
          branchId={branchId}
          employeeId={employeeId}
          role={role}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => { loadAll(); setShowTransfer(false); }}
        />
      )}

      {showIncomingTransfers && (
        <IncomingTransfersModal
          branchId={branchId}
          employeeId={employeeId}
          onClose={() => setShowIncomingTransfers(false)}
          onUpdated={() => { loadAll(); }}
        />
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={updated => {
            setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
            setEditingProduct(null);
          }}
        />
      )}

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
          role={role}
          onClose={() => { setShowAddPurchase(false); setRepeatPurchaseData(undefined); }}
          onSuccess={() => { loadAll(); setRepeatPurchaseData(undefined); }}
          initialData={repeatPurchaseData}
        />
      )}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {(selectedSale.client as any)?.name || (selectedSale.client as any)?.phone || 'Без клиента'}
              </h2>
              <button onClick={() => setSelectedSale(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Дата</span>
                <span>{new Date(selectedSale.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Сотрудник</span>
                <span>{(selectedSale.employee as any)?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Статус</span>
                <StatusBadge status={selectedSale.status} />
              </div>

              {/* Позиции */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">Позиции:</p>
                <div className="space-y-2">
                  {selectedSale.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <div>
                        <p className="text-sm text-gray-900">{(item.product as any)?.name}</p>
                        <p className="text-xs text-gray-400">{item.quantity} шт × ₸{item.price.toLocaleString()}</p>
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        ₸{(item.quantity * item.price).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Итог */}
              <div className="flex justify-between text-base font-semibold text-gray-900 pt-2">
                <span>Итого:</span>
                <span>₸{selectedSale.total.toLocaleString()}</span>
              </div>

              {/* Оплата */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <p className="text-xs font-semibold text-gray-500">Оплата:</p>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>
                    {selectedSale.payment_method === 'cash' ? '💵 Наличные' :
                     selectedSale.payment_method === 'kaspi_qr' ? '📱 Kaspi QR' : '💳 Смешанная'}
                  </span>
                </div>
                {selectedSale.paid_cash > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Наличными:</span>
                    <span>₸{selectedSale.paid_cash.toLocaleString()}</span>
                  </div>
                )}
                {selectedSale.paid_kaspi > 0 && (
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Kaspi QR:</span>
                    <span>₸{selectedSale.paid_kaspi.toLocaleString()}</span>
                  </div>
                )}
                {selectedSale.paid_cash > 0 && (selectedSale.paid_cash + selectedSale.paid_kaspi) > selectedSale.total && (
                  <div className="flex justify-between text-sm font-medium text-green-600">
                    <span>Сдача:</span>
                    <span>₸{(selectedSale.paid_cash + selectedSale.paid_kaspi - selectedSale.total).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {selectedSale.notes && (
                <p className="text-sm text-gray-500 italic border-t border-gray-100 pt-3">{selectedSale.notes}</p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => setSelectedSale(null)} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRevision && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                Ревизия от {new Date(selectedRevision.created_at).toLocaleDateString('ru-RU')}
              </h2>
              <button onClick={() => setSelectedRevision(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Статус</span>
                <StatusBadge status={selectedRevision.status} />
              </div>
              {selectedRevision.completed_at && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Завершена</span>
                  <span>{new Date(selectedRevision.completed_at).toLocaleDateString('ru-RU')}</span>
                </div>
              )}

              {/* Итог по расхождениям */}
              {(() => {
                const ritems = selectedRevision.items ?? [];
                const withDiff = ritems.filter(i => (i.difference ?? 0) !== 0);
                const surplus = withDiff.filter(i => (i.difference ?? 0) > 0).length;
                const shortage = withDiff.filter(i => (i.difference ?? 0) < 0).length;
                return (
                  <div className="flex gap-3">
                    <div className="flex-1 bg-green-50 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-green-600 font-medium">Излишки</p>
                      <p className="text-lg font-bold text-green-700">{surplus}</p>
                    </div>
                    <div className="flex-1 bg-red-50 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-red-600 font-medium">Недостачи</p>
                      <p className="text-lg font-bold text-red-700">{shortage}</p>
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-gray-500 font-medium">Всего</p>
                      <p className="text-lg font-bold text-gray-700">{ritems.length}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Позиции */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">Позиции:</p>
                <div className="space-y-1.5">
                  {selectedRevision.items?.map((item, idx) => {
                    const diff = item.difference ?? 0;
                    return (
                      <div key={idx} className={`flex items-center justify-between py-2 px-3 rounded-lg border ${
                        item.actual_qty === null ? 'border-gray-100 bg-gray-50' :
                        diff === 0 ? 'border-green-100 bg-green-50' :
                        diff > 0 ? 'border-blue-100 bg-blue-50' :
                        'border-red-100 bg-red-50'
                      }`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{(item.product as any)?.name}</p>
                          <p className="text-xs text-gray-400">
                            Ожид: {item.expected_qty} · Факт: {item.actual_qty ?? '—'}
                          </p>
                        </div>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                          item.actual_qty === null ? 'bg-gray-100 text-gray-500' :
                          diff === 0 ? 'bg-green-100 text-green-600' :
                          diff > 0 ? 'bg-blue-100 text-blue-600' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {item.actual_qty === null ? '—' : diff > 0 ? `+${diff}` : diff === 0 ? '✓' : diff}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => setSelectedRevision(null)} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddSale && (
        <AddSaleModal
          branchId={branchId}
          employeeId={employeeId}
          onClose={() => setShowAddSale(false)}
          onSuccess={loadAll}
        />
      )}
      {showSuppliers && (
        <SuppliersModal onClose={() => setShowSuppliers(false)} />
      )}
      {selectedBranch && (
        <BranchDetailModal
          branch={selectedBranch}
          onClose={() => setSelectedBranch(null)}
        />
      )}

      {showRevision && (
        <RevisionModal
          branchId={branchId}
          employeeId={employeeId}
          existingRevisionId={continueRevisionId}
          onClose={() => { setShowRevision(false); setContinueRevisionId(undefined); }}
          onSuccess={async () => { await loadAll(); setContinueRevisionId(undefined); }}
        />
      )}

      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {(selectedPurchase.supplier as any)?.name ?? 'Без поставщика'}
              </h2>
              <button onClick={() => setSelectedPurchase(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Дата</span>
                <span>{new Date(selectedPurchase.created_at).toLocaleDateString('ru-RU')}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Статус</span>
                <StatusBadge status={selectedPurchase.status} />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-2">Позиции:</p>
                <div className="space-y-2">
                  {selectedPurchase.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <div>
                        <p className="text-sm text-gray-900">{(item.product as any)?.name}</p>
                        <p className="text-xs text-gray-400">Цена прихода: ₸{item.cost_price.toLocaleString()}</p>
                      </div>
                      <span className="text-sm font-medium text-gray-700">{item.quantity} шт</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-base font-semibold text-gray-900 pt-2">
                <span>Итого:</span>
                <span>₸{selectedPurchase.total.toLocaleString()}</span>
              </div>
              {selectedPurchase.notes && (
                <p className="text-sm text-gray-500 italic">{selectedPurchase.notes}</p>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100">
              <button onClick={() => setSelectedPurchase(null)} className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Закрыть
              </button>
            </div>
          </div>
        </div>
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

function MovementsTable({ movements, emptyText = 'Движений нет' }: { movements: StockMovement[]; emptyText?: string }) {
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
        <div className="text-center py-12 text-gray-400 text-sm">{emptyText}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {movements.map(m => {
            const t = typeLabel[m.type] ?? { label: m.type, color: 'text-gray-600' };
            return (
              <div key={m.id} className="grid grid-cols-12 items-center px-4 py-3">
                <div className="col-span-4">
                  <p className="text-sm text-gray-900">{(m.product as any)?.name ?? '—'}</p>
                  {m.type === 'transfer' && m.notes
                    ? <p className="text-xs text-gray-400">{m.notes}</p>
                    : <p className="text-xs text-gray-400">{(m.employee as any)?.name ?? '—'}</p>
                  }
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

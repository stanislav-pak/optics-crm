import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Plus, Search, QrCode, Trash2, X, Users, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  getProducts, getProductsFromStock, getStock, getInventoryStats, getLowStockAlerts,
  getStockMovements, getPurchaseOrders, getSales, getRevisions,
  deleteRevision, getIncomingTransfers,
} from '../services/inventory';
import { supabase } from '../services/supabase';
import type {
  Product, Stock, InventoryStats, StockAlert,
  StockMovement, PurchaseOrder, Sale, Revision, Branch, ServiceOrder
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
import LowStockModal from '../components/Inventory/LowStockModal';
import WriteoffModal from '../components/Inventory/WriteoffModal';
import MovementDetailModal from '../components/Inventory/MovementDetailModal';
import ReturnModal from '../components/Inventory/ReturnModal';
import BarcodeScanner from '../components/Shared/BarcodeScanner';
import CashSessionCard from '../components/Inventory/CashSessionCard';
import WorkshopPage from './WorkshopPage';
import { fetchServiceOrderBySaleId } from '../services/workshop';

type Tab = 'overview' | 'products' | 'movements' | 'purchases' | 'sales' | 'revisions' | 'writeoffs' | 'returns';

interface InventoryPageProps {
  branchId: string;
  employeeId: string;
  role: 'manager' | 'branch_admin' | 'admin';
  defaultTab?: Tab;
  storefront?: boolean;
  onPendingTransfersChange?: (has: boolean) => void;
}

// ---- Excel export helpers ----
const STATUS_RU: Record<string, string> = {
  draft: 'Черновик', confirmed: 'Подтверждён', received: 'Получен',
  cancelled: 'Отменён', pending: 'Ожидает', paid: 'Оплачено',
  refunded: 'Возврат', partially_refunded: 'Частичный возврат', in_progress: 'В процессе', completed: 'Завершена',
  in_transit: 'В пути',
};
const MV_TYPE_RU: Record<string, string> = {
  in: 'Приход', out: 'Продажа', writeoff: 'Списание',
  transfer: 'Перемещение', revision_adjust: 'Ревизия', return: 'Возврат',
};
const WS_STATUS_RU: Record<string, string> = {
  new: 'Новый', in_progress: 'В работе', ready: 'Готов',
  confirmed: 'Подтверждён', done: 'Выполнен', cancelled: 'Отменён',
};
function xlsxExport(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Данные');
  XLSX.writeFile(wb, filename);
}
function xlsxDate() { return new Date().toISOString().split('T')[0]; }

const ExportBtn = ({ onClick }: { onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 flex-shrink-0"
  >
    <Download size={13} />
    Экспорт
  </button>
);

export default function InventoryPage({ branchId, employeeId, role, defaultTab, storefront, onPendingTransfersChange }: InventoryPageProps) {
  const lastTransferCheckRef = useRef(new Date().toISOString());
  const lastMovementsViewedRef = useRef<string>(
    localStorage.getItem('lastViewedMovements') ?? new Date(0).toISOString()
  );
  const [hasUnreadTransfers, setHasUnreadTransfers] = useState(false);
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'overview');
  const [activeBranchId, setActiveBranchId] = useState(branchId);
  const [prevActiveBranchId, setPrevActiveBranchId] = useState(branchId);
  const [allBranches, setAllBranches] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesRefreshKey, setSalesRefreshKey] = useState(0);
  const [saleWorkshopRemainders, setSaleWorkshopRemainders] = useState<Record<string, number>>({});
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
  const [showScanner, setShowScanner] = useState(false);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showWriteoff, setShowWriteoff] = useState(false);
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  // Фильтры продаж
  const [saleFilterBranch, setSaleFilterBranch] = useState('');
  const [saleFilterEmployee, setSaleFilterEmployee] = useState('');
  const [saleFilterDate, setSaleFilterDate] = useState('all');
  const [saleFilterDateFrom, setSaleFilterDateFrom] = useState('');
  const [saleFilterDateTo, setSaleFilterDateTo] = useState('');
  const [saleProductSearch, setSaleProductSearch] = useState('');
  const [saleEmployees, setSaleEmployees] = useState<{ id: string; name: string; branch_id: string }[]>([]);
  // Фильтры списаний
  const [woDateFilter, setWoDateFilter] = useState<string>('all');
  const [woDateFrom, setWoDateFrom] = useState('');
  const [woDateTo, setWoDateTo] = useState('');
  const [woProductSearch, setWoProductSearch] = useState('');
  // Фильтры возвратов
  const [retFilterDate, setRetFilterDate] = useState<string>('all');
  const [retFilterDateFrom, setRetFilterDateFrom] = useState('');
  const [retFilterDateTo, setRetFilterDateTo] = useState('');
  const [retFilterBranch, setRetFilterBranch] = useState('');
  const [retProductSearch, setRetProductSearch] = useState('');
  const [retExpanded, setRetExpanded] = useState<Set<string>>(new Set());
  // Фильтры ревизий
  const [rvFilterStatus, setRvFilterStatus] = useState('all');
  const [rvDateFilter, setRvDateFilter] = useState('all');
  const [rvDateFrom, setRvDateFrom] = useState('');
  const [rvDateTo, setRvDateTo] = useState('');
  const [rvProductSearch, setRvProductSearch] = useState('');
  const [showAddPurchase, setShowAddPurchase] = useState(false);
  const [showAddSale, setShowAddSale] = useState(false);
  const [showRevision, setShowRevision] = useState(false);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [continueRevisionId, setContinueRevisionId] = useState<string | undefined>(undefined);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseOrder | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [repeatPurchaseData, setRepeatPurchaseData] = useState<{ supplier_id?: string; items?: Array<{ product_id: string; quantity: number; cost_price: number }> } | undefined>(undefined);
  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleWorkshopOrder, setSaleWorkshopOrder] = useState<ServiceOrder | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showSaleReturn, setShowSaleReturn] = useState(false);
  const [branches, setBranches] = useState<{ id: string; name: string; is_warehouse?: boolean }[]>([]);
  const [allBranchesStock, setAllBranchesStock] = useState<{ branch_id: string; quantity: number }[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [incomingTransfers, setIncomingTransfers] = useState<any[]>([]);
  const [showIncomingTransfers, setShowIncomingTransfers] = useState(false);
  const [completedTransfers, setCompletedTransfers] = useState<any[]>([]);
  const [showLowStock, setShowLowStock] = useState(false);
  const [inTransitMovements, setInTransitMovements] = useState<{ product_id: string; branch_id: string; to_branch_id: string; quantity: number; created_at: string }[]>([]);

  useEffect(() => { setActiveBranchId(branchId); }, [branchId]);

  // Загружаем связанный заказ мастерской при открытии детали продажи
  useEffect(() => {
    if (!selectedSale) { setSaleWorkshopOrder(null); return; }
    fetchServiceOrderBySaleId(selectedSale.id)
      .then(setSaleWorkshopOrder)
      .catch(() => setSaleWorkshopOrder(null));
  }, [selectedSale?.id]);

  // Запоминаем предыдущий филиал перед переходом в Мастерскую
  const WORKSHOP_BRANCH_ID = '1104bc27-07bb-4930-93b2-19a2d92b71c9';
  useEffect(() => {
    if (activeBranchId !== WORKSHOP_BRANCH_ID) {
      setPrevActiveBranchId(activeBranchId);
    }
  }, [activeBranchId]);

  useEffect(() => {
    if (role === 'admin') {
      supabase.from('branches').select('*').order('name').then(({ data }) => {
        if (data) setAllBranches(data);
      });
    }
  }, [role]);

  // Загружаем филиалы один раз при монтировании
  useEffect(() => {
    supabase.from('branches').select('id, name, is_warehouse').order('name').then(({ data }) => {
      if (!data) return;
      const sorted = [...data].sort((a, b) => (b.is_warehouse ? 1 : 0) - (a.is_warehouse ? 1 : 0));
      setBranches(sorted);
    });
  }, []);

  // Загружаем сотрудников для фильтра продаж
  useEffect(() => {
    supabase.from('employees').select('id, name, branch_id').order('name')
      .then(({ data }) => setSaleEmployees(data ?? []));
  }, []);

  useEffect(() => {
    loadAll();
  }, [activeBranchId]);

  // Принудительный рефреш ревизий при переключении на вкладку
  useEffect(() => {
    if (tab === 'revisions') {
      getRevisions(activeBranchId).then(setRevisions).catch(e => console.error('getRevisions refresh:', e));
    }
  }, [tab]);

  // Точка-уведомление на вкладке Движения и кнопке Склада
  useEffect(() => {
    const hasNew = inTransitMovements.some(
      m => m.created_at > lastMovementsViewedRef.current
    );
    setHasUnreadTransfers(hasNew);
    onPendingTransfersChange?.(hasNew);
  }, [inTransitMovements]);

  // Polling: проверка новых входящих перемещений каждые 15 секунд
  useEffect(() => {
    if (!activeBranchId) return;

    const audioCtx = { current: null as AudioContext | null };

    const playSound = () => {
      const ctx = audioCtx.current ?? new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtx.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    };

    const checkNewTransfers = async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('id')
        .eq('to_branch_id', activeBranchId)
        .eq('type', 'transfer')
        .eq('status', 'in_transit')
        .gt('created_at', lastTransferCheckRef.current);

      if (data && data.length > 0) {
        lastTransferCheckRef.current = new Date().toISOString();
        playSound();
        loadAll();
      }
    };

    const interval = setInterval(checkNewTransfers, 15000);
    return () => clearInterval(interval);
  }, [activeBranchId]);

  async function loadAll() {
    // Для admin — не фильтруем по филиалу (видит данные всех филиалов)
    const scopeId = role === 'admin' ? undefined : activeBranchId;
    setLoading(true);

    try { const s = await getInventoryStats(scopeId); setStats(s); }
    catch (e) { console.error('getInventoryStats error:', e); }

    try {
      // getProducts фильтрует только по is_active, без ограничения по остатку —
      // новые товары с нулевым остатком отображаются сразу после создания
      const p = await getProducts(role === 'admin' ? undefined : activeBranchId);
      setProducts(p);
    }
    catch (e) { console.error('getProducts error:', e); }

    try { const st = await getStock(scopeId); setStock(st); }
    catch (e) { console.error('getStock error:', e); }

    try { const al = await getLowStockAlerts(scopeId); setAlerts(al); }
    catch (e) { console.error('getLowStockAlerts error:', e); }

    try { const mv = await getStockMovements(role === 'admin' ? undefined : activeBranchId); setMovements(mv); }
    catch (e) { console.error('getStockMovements error:', e); }

    try { const po = await getPurchaseOrders(scopeId); setPurchases(po); }
    catch (e) { console.error('getPurchaseOrders error:', e); }

    try {
      const sa = await getSales(scopeId);
      setSales(sa);
      await loadWorkshopRemainders(sa.map(s => s.id));
    }
    catch (e) { console.error('getSales error:', e); }

    try { const rv = await getRevisions(scopeId); setRevisions(rv); }
    catch (e) { console.error('getRevisions error:', e); }

    try {
      const { data: abs } = await supabase.from('stock').select('branch_id, quantity');
      setAllBranchesStock(abs ?? []);
    } catch (e) { console.error('allBranchesStock error:', e); }

    try {
      const { data: it } = await supabase
        .from('stock_movements')
        .select('product_id, branch_id, to_branch_id, quantity, created_at')
        .eq('type', 'transfer')
        .eq('status', 'in_transit');
      setInTransitMovements(it ?? []);
    } catch (e) { console.error('inTransitMovements error:', e); }

    setLoading(false);

    // Входящие перемещения (in_transit) — всегда по конкретному branchId (не scopeId)
    try {
      const incoming = await getIncomingTransfers(activeBranchId);
      setIncomingTransfers(incoming);
    } catch (e) {
      console.error('getIncomingTransfers error:', e);
      setIncomingTransfers([]);
    }

    // Завершённые входящие перемещения для вкладки Приходы
    try {
      let q = supabase
        .from('stock_movements')
        .select(`
          id, product_id, branch_id, to_branch_id, quantity, created_at, notes,
          product:products!stock_movements_product_id_fkey(id, name, cost_price),
          from_branch:branches!stock_movements_branch_id_fkey(id, name)
        `)
        .eq('type', 'transfer')
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      if (role !== 'admin') q = q.eq('to_branch_id', activeBranchId);
      const { data: ct } = await q;
      setCompletedTransfers(ct ?? []);
    } catch (e) {
      console.error('completedTransfers error:', e);
      setCompletedTransfers([]);
    }
  }

  // Загружает остатки мастерской для карточек продаж
  async function loadWorkshopRemainders(saleIds: string[]) {
    if (saleIds.length === 0) { setSaleWorkshopRemainders({}); return; }
    try {
      const { data: wsOrders } = await supabase
        .from('service_orders')
        .select('sale_id, service_price, parts_price, prepayment')
        .in('sale_id', saleIds)
        .not('status', 'in', '("done","cancelled")');
      const map: Record<string, number> = {};
      (wsOrders ?? []).forEach((o: { sale_id: string; service_price: number; parts_price: number; prepayment: number }) => {
        const remainder = o.service_price + o.parts_price - o.prepayment;
        if (remainder > 0 && o.sale_id) map[o.sale_id] = remainder;
      });
      setSaleWorkshopRemainders(map);
    } catch (e) { console.error('loadWorkshopRemainders error:', e); }
  }

  // Быстрые перезагрузки отдельных срезов данных
  async function loadSales() {
    const scopeId = role === 'admin' ? undefined : activeBranchId;
    try {
      const [sa, mv] = await Promise.all([
        getSales(scopeId),
        getStockMovements(role === 'admin' ? undefined : activeBranchId),
      ]);
      setSales(sa);
      setMovements(mv);
      await loadWorkshopRemainders(sa.map(s => s.id));
    }
    catch (e) { console.error('loadSales error:', e); }
  }

  async function loadStats() {
    const scopeId = role === 'admin' ? undefined : activeBranchId;
    try { const s = await getInventoryStats(scopeId); setStats(s); }
    catch (e) { console.error('loadStats error:', e); }
  }

  async function loadStock() {
    const scopeId = role === 'admin' ? undefined : activeBranchId;
    try {
      const [st, al] = await Promise.all([
        getStock(scopeId),
        getLowStockAlerts(scopeId),
      ]);
      setStock(st);
      setAlerts(al);
    }
    catch (e) { console.error('loadStock error:', e); }
  }

  async function handleReturnSuccess() {
    setShowReturnModal(false);
    setSalesRefreshKey(k => k + 1);
    await Promise.all([
      loadSales(),    // продажи + движения
      loadStats(),    // статистика и счётчики
      loadStock(),    // остатки + алерты низкого остатка
    ]);
  }

  async function handleSaleDetailReturnSuccess() {
    setShowSaleReturn(false);
    setSelectedSale(null);
    setSalesRefreshKey(k => k + 1);
    await Promise.all([loadSales(), loadStats(), loadStock()]);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Обзор' },
    { key: 'products', label: 'Товары' },
    { key: 'movements', label: 'Движения' },
    { key: 'purchases', label: 'Приходы' },
    { key: 'sales', label: 'Продажи' },
    { key: 'writeoffs', label: 'Списания' },
    { key: 'returns', label: 'Возвраты' },
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
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasActiveRevision = revisions.some(r => r.status === 'in_progress');
  const overviewBlocked = role === 'manager' && hasActiveRevision;

  if (role === 'admin' && activeBranchId === '1104bc27-07bb-4930-93b2-19a2d92b71c9') {
    return (
      <div className="min-h-screen bg-gray-50">
        {allBranches.length > 0 && (
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap gap-2">
            {allBranches.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBranchId(b.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeBranchId === b.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
        <WorkshopPage branchId={null} employeeId={employeeId} role="admin" onBack={() => setActiveBranchId(prevActiveBranchId)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {role === 'admin' && allBranches.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap gap-2">
          {allBranches.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveBranchId(b.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeBranchId === b.id
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
      {/* Header */}
      {!storefront && (
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-900">Склад</h1>
            {alerts.length > 0 && (
              <button
                onClick={() => setShowLowStock(true)}
                className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-sm hover:bg-red-100 transition-colors"
              >
                <AlertTriangle size={16} />
                <span>{alerts.length} товаров заканчивается</span>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 mt-3 pb-1">
            {tabs.filter(t => role === 'admin' || t.key !== 'sales').map(t => {
              const isOverviewBlocked = t.key === 'overview' && overviewBlocked;
              return (
              <button
                key={t.key}
                disabled={isOverviewBlocked}
                title={isOverviewBlocked ? 'Остатки недоступны во время ревизии' : undefined}
                onClick={() => {
                  if (isOverviewBlocked) return;
                  setTab(t.key);
                  if (t.key === 'movements') {
                    const now = new Date().toISOString();
                    lastMovementsViewedRef.current = now;
                    localStorage.setItem('lastViewedMovements', now);
                    setHasUnreadTransfers(false);
                    onPendingTransfersChange?.(false);
                  }
                }}
                className={`relative px-1.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
                  isOverviewBlocked ? 'opacity-40 cursor-not-allowed' :
                  tab === t.key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
                {t.key === 'movements' && hasUnreadTransfers && tab !== 'movements' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>
              );
            })}
          </div>

        </div>
      )}

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
                <div className="bg-white rounded-xl border border-red-100 divide-y divide-gray-100 overflow-hidden">
                  {alerts.slice(0, 5).map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setShowLowStock(true)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50 active:bg-red-100 text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{(a.product as any)?.name}</p>
                        <p className="text-xs text-gray-500">Мин: {(a.product as any)?.min_stock} {(a.product as any)?.unit}</p>
                      </div>
                      <span className="text-red-600 font-semibold text-sm tabular-nums">{a.current_qty} шт</span>
                    </button>
                  ))}
                  {alerts.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowLowStock(true)}
                      className="w-full px-4 py-2.5 text-xs text-center text-red-500 hover:bg-red-50 transition-colors"
                    >
                      Ещё {alerts.length - 5} товаров →
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Последние движения</h2>
              <MovementsTable movements={movements.slice(0, 10)} onRowClick={id => setSelectedMovementId(id)} role={role} />
            </div>
          </div>
        )}

        {/* ТОВАРЫ */}
        {tab === 'products' && (
          <div className="space-y-3">
            {/* Поиск + кнопка сканера */}
            <div className="flex gap-2 items-center w-full">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="Поиск по названию, SKU, штрихкоду..."
                  className="flex-1 w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/* Дропдаун подсказок */}
                {searchFocused && (() => {
                  const suggestions = filteredProducts.slice(0, 5);
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      {suggestions.map(p => {
                        const qty = stock.filter(s => s.product_id === p.id).reduce((sum, s) => sum + s.quantity, 0);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={e => { e.preventDefault(); setSelectedProduct(p); setSearch(''); setSearchFocused(false); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left"
                          >
                            <span className="text-sm text-gray-900 truncate mr-3">{p.name}</span>
                            <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                              {qty} {p.unit} · ₸{p.price.toLocaleString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <button
                onClick={() => setShowScanner(true)}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M3 4.875C3 3.839 3.84 3 4.875 3h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 013 9.375v-4.5zM4.875 4.5a.375.375 0 00-.375.375v4.5c0 .207.168.375.375.375h4.5a.375.375 0 00.375-.375v-4.5a.375.375 0 00-.375-.375h-4.5zm7.875.375c0-1.036.84-1.875 1.875-1.875h4.5C20.16 3 21 3.84 21 4.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5a1.875 1.875 0 01-1.875-1.875v-4.5zm1.875-.375a.375.375 0 00-.375.375v4.5c0 .207.168.375.375.375h4.5a.375.375 0 00.375-.375v-4.5a.375.375 0 00-.375-.375h-4.5zM6 6.75a.75.75 0 01.75-.75h.75a.75.75 0 010 1.5H6.75A.75.75 0 016 6.75zm9.75 0a.75.75 0 01.75-.75h.75a.75.75 0 010 1.5h-.75a.75.75 0 01-.75-.75zM3 14.625c0-1.036.84-1.875 1.875-1.875h4.5c1.036 0 1.875.84 1.875 1.875v4.5c0 1.036-.84 1.875-1.875 1.875h-4.5A1.875 1.875 0 013 19.125v-4.5zm1.875-.375a.375.375 0 00-.375.375v4.5c0 .207.168.375.375.375h4.5a.375.375 0 00.375-.375v-4.5a.375.375 0 00-.375-.375h-4.5zM6 16.5a.75.75 0 01.75-.75h.75a.75.75 0 010 1.5H6.75A.75.75 0 016 16.5zm9.75-1.875a.75.75 0 00-.75.75v.75a.75.75 0 001.5 0v-.75a.75.75 0 00-.75-.75zm-1.5 3.75a.75.75 0 01.75-.75h.75a.75.75 0 01.75.75v.75a.75.75 0 01-.75.75h-.75a.75.75 0 01-.75-.75v-.75zm3.75-3a.75.75 0 00-.75.75v3.75a.75.75 0 001.5 0v-3.75a.75.75 0 00-.75-.75z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {/* Кнопки — Экспорт и Добавить */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const supplierMap: Record<string, string> = {};
                  purchases.forEach(po => {
                    const sName = (po.supplier as any)?.name;
                    if (!sName) return;
                    po.items?.forEach(i => { if (!supplierMap[i.product_id]) supplierMap[i.product_id] = sName; });
                  });
                  const rows = filteredProducts.map(p => {
                    const qty = stock
                      .filter(s => s.product_id === p.id)
                      .reduce((sum, s) => sum + s.quantity, 0);
                    return {
                      'Название': p.name,
                      'SKU / Артикул': p.sku ?? '—',
                      'Штрихкод': p.barcode ?? '—',
                      'Остаток (шт)': qty,
                      'Цена закупочная': p.cost_price,
                      'Цена продажная': p.price,
                      'Разница цен': p.price - p.cost_price,
                      'Поставщик': supplierMap[p.id] ?? '—',
                    };
                  });
                  xlsxExport(rows, `товары_${xlsxDate()}.xlsx`);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                <Download size={15} />
                Экспорт
              </button>
              <button
                onClick={() => setShowAddProduct(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus size={15} />
                Добавить
              </button>
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
                      <div key={p.id} className={`flex items-center px-4 py-3 hover:bg-gray-50 gap-3 cursor-pointer ${highlightedProductId === p.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`} onClick={() => setSelectedProduct(p)}>
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
            // Фронтовой guard: для не-админа только движения своего филиала
            if (role !== 'admin') {
              const mb = (m as any).branch_id;
              const mtb = (m as any).to_branch_id;
              if (mb !== activeBranchId && mtb !== activeBranchId) return false;
            }

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

              {/* Счётчик + экспорт */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  {(mvTypeFilter !== 'all' || mvDateFilter !== 'all' || mvProductSearch) && (
                    <>
                      <p className="text-xs text-gray-400">
                        Найдено: {filteredMovements.length} из {movements.length}
                      </p>
                      <button
                        onClick={() => { setMvTypeFilter('all'); setMvDateFilter('all'); setMvDateFrom(''); setMvDateTo(''); setMvProductSearch(''); }}
                        className="text-xs text-blue-600 hover:underline flex-shrink-0">
                        Сбросить
                      </button>
                    </>
                  )}
                </div>
                <ExportBtn onClick={() => {
                  const rows = filteredMovements.map(m => ({
                    'Дата': new Date(m.created_at).toLocaleDateString('ru-RU'),
                    'Тип': MV_TYPE_RU[m.type] ?? m.type,
                    'Товар': (m.product as any)?.name ?? '—',
                    'Артикул': (m.product as any)?.sku ?? '—',
                    'Количество': m.quantity,
                    'Сотрудник': (m.employee as any)?.name ?? '—',
                    'Примечание': m.notes ?? '',
                  }));
                  xlsxExport(rows, `движения_${xlsxDate()}.xlsx`);
                }} />
              </div>

              {/* Сводка остатков по филиалам при фильтре «Перемещение» — только для admin */}
              {mvTypeFilter === 'transfer' && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-700">Остатки по филиалам</h3>
                    <button
                      onClick={() => setShowTransfer(true)}
                      className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700"
                    >
                      <Plus size={13} />
                      Перемещение
                    </button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {branches.map(b => {
                      const total = allBranchesStock
                        .filter(s => s.branch_id === b.id)
                        .reduce((sum, s) => sum + s.quantity, 0);
                      const outgoing = inTransitMovements
                        .filter(m => m.branch_id === b.id)
                        .reduce((sum, m) => sum + m.quantity, 0);
                      const incoming = inTransitMovements
                        .filter(m => m.to_branch_id === b.id)
                        .reduce((sum, m) => sum + m.quantity, 0);
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
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-sm font-semibold text-gray-900 tabular-nums">{total} шт</span>
                            {outgoing > 0 && (
                              <span className="text-xs text-orange-500 tabular-nums">📤 В пути: {outgoing} шт</span>
                            )}
                            {incoming > 0 && (
                              <span className="text-xs text-blue-500 tabular-nums">📥 Ожидается: {incoming} шт</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <MovementsTable movements={filteredMovements} emptyText="Нет движений по выбранным фильтрам" onRowClick={id => setSelectedMovementId(id)} role={role} />
            </div>
          );
        })()}

        {/* ПРИХОДЫ */}
        {tab === 'purchases' && (() => {
          // Объединённый список: накладные + завершённые входящие перемещения, сортировка по дате
          type Entry =
            | { kind: 'purchase'; date: string; po: PurchaseOrder }
            | { kind: 'transfer'; date: string; mv: any };
          const unified: Entry[] = [
            ...purchases.map(po => ({ kind: 'purchase' as const, date: po.created_at, po })),
            ...completedTransfers.map(mv => ({ kind: 'transfer' as const, date: mv.created_at, mv })),
          ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

          return (
            <div className="space-y-4">
              <div className="flex justify-end gap-2">
                <ExportBtn onClick={() => {
                  const rows: Record<string, unknown>[] = [];
                  purchases.forEach(po => {
                    const date = new Date(po.created_at).toLocaleDateString('ru-RU');
                    const supplier = (po.supplier as any)?.name ?? '—';
                    const status = STATUS_RU[po.status] ?? po.status;
                    if (po.items?.length) {
                      po.items.forEach(i => rows.push({
                        'Дата': date, 'Поставщик': supplier,
                        'Товар': (i.product as any)?.name ?? '—',
                        'Количество': i.quantity, 'Цена прихода': i.cost_price,
                        'Сумма': i.quantity * i.cost_price, 'Статус': status,
                      }));
                    } else {
                      rows.push({ 'Дата': date, 'Поставщик': supplier, 'Товар': '—', 'Количество': '—', 'Цена прихода': '—', 'Сумма': po.total, 'Статус': status });
                    }
                  });
                  xlsxExport(rows, `приходы_${xlsxDate()}.xlsx`);
                }} />
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
                {unified.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">Приходов нет</div>
                ) : unified.map(entry => {
                  if (entry.kind === 'purchase') {
                    const po = entry.po;
                    return (
                      <div
                        key={`po-${po.id}`}
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
                    );
                  }
                  // kind === 'transfer'
                  const mv = entry.mv;
                  const product = mv.product;
                  const costPrice = product?.cost_price ?? 0;
                  const total = mv.quantity * costPrice;
                  return (
                    <div key={`tr-${mv.id}`} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100" onClick={() => setSelectedMovementId(mv.id)}>
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {product?.name ?? '—'} · {mv.quantity} шт
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {costPrice > 0 ? `₸${costPrice.toLocaleString()} / шт · ` : ''}Из: {mv.from_branch?.name ?? '—'} · {new Date(mv.created_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-medium text-gray-900">₸{total.toLocaleString()}</p>
                        <p className="text-[10px] text-purple-500 font-medium">Перемещение</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {storefront && (
          <div className="mb-4">
            <CashSessionCard branchId={activeBranchId} employeeId={employeeId} />
          </div>
        )}

        {/* ПРОДАЖИ */}
        {(tab === 'sales' || storefront) && (() => {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
          const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

          const filteredEmployees = saleFilterBranch
            ? saleEmployees.filter(e => e.branch_id === saleFilterBranch)
            : saleEmployees;

          const filteredSales = sales.filter(s => {
            if (saleFilterBranch && (s as any).branch_id !== saleFilterBranch) return false;
            if (saleFilterEmployee && (s.employee as any)?.id !== saleFilterEmployee) return false;
            const sDate = s.created_at.split('T')[0];
            if (saleFilterDate === 'today' && sDate !== todayStr) return false;
            if (saleFilterDate === 'week' && new Date(sDate) < weekAgo) return false;
            if (saleFilterDate === 'month' && new Date(sDate) < monthAgo) return false;
            if (saleFilterDate === 'custom') {
              if (saleFilterDateFrom && sDate < saleFilterDateFrom) return false;
              if (saleFilterDateTo && sDate > saleFilterDateTo) return false;
            }
            if (saleProductSearch) {
              const found = s.items?.some(i =>
                (i.product as any)?.name?.toLowerCase().includes(saleProductSearch.toLowerCase())
              );
              if (!found) return false;
            }
            return true;
          });

          const hasFilters = !!(saleFilterBranch || saleFilterEmployee || saleFilterDate !== 'all' || saleProductSearch);
          const resetFilters = () => {
            setSaleFilterBranch('');
            setSaleFilterEmployee('');
            setSaleFilterDate('all');
            setSaleFilterDateFrom('');
            setSaleFilterDateTo('');
            setSaleProductSearch('');
          };

          const dateOptions = [
            { value: 'all', label: 'Всё время' },
            { value: 'today', label: 'Сегодня' },
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
            { value: 'custom', label: 'Период' },
          ];

          return (
            <div className="space-y-4">

              {/* Кнопка + итог */}
              <div className="flex items-center justify-between gap-3">
                {hasFilters ? (
                  <p className="text-xs text-gray-400">
                    Показано: <span className="font-medium text-gray-600">{filteredSales.length}</span> из {sales.length}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ExportBtn onClick={() => {
                    const rows = filteredSales.map(s => ({
                      'Дата': new Date(s.created_at).toLocaleDateString('ru-RU'),
                      'Клиент': (s.client as any)?.name || (s.client as any)?.phone || '—',
                      'Сотрудник': (s.employee as any)?.name ?? '—',
                      'Товары': s.items?.map(i => `${(i.product as any)?.name} ×${i.quantity}`).join('; ') ?? '—',
                      'Итого': s.total,
                      'Наличными': s.paid_cash || 0,
                      'Kaspi QR': s.paid_kaspi || 0,
                      'Способ оплаты': s.payment_method === 'cash' ? 'Наличные' : s.payment_method === 'kaspi_qr' ? 'Kaspi QR' : 'Смешанная',
                      'Статус': STATUS_RU[s.status] ?? s.status,
                    }));
                    xlsxExport(rows, `продажи_${xlsxDate()}.xlsx`);
                  }} />
                  <button
                    onClick={() => setShowAddSale(true)}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700"
                  >
                    <Plus size={16} />
                    Новая продажа
                  </button>
                </div>
              </div>

              {/* Фильтры */}
              <div className="space-y-3">

                {/* Филиал + Менеджер (только для admin) */}
                {role === 'admin' && (
                  <div className="flex gap-2">
                    <select
                      value={saleFilterBranch}
                      onChange={e => { setSaleFilterBranch(e.target.value); setSaleFilterEmployee(''); }}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    >
                      <option value="">Все филиалы</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.is_warehouse ? '🏭 ' : ''}{b.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={saleFilterEmployee}
                      onChange={e => setSaleFilterEmployee(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    >
                      <option value="">Все менеджеры</option>
                      {filteredEmployees.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Быстрые кнопки дат */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {dateOptions.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setSaleFilterDate(o.value)}
                      style={{
                        flexShrink: 0, whiteSpace: 'nowrap',
                        padding: '3px 8px', borderRadius: '999px',
                        fontSize: '11px', fontWeight: 500, cursor: 'pointer',
                        border: saleFilterDate === o.value ? 'none' : '1px solid #e5e7eb',
                        backgroundColor: saleFilterDate === o.value ? '#16a34a' : '#fff',
                        color: saleFilterDate === o.value ? '#fff' : '#4b5563',
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {/* Произвольный период */}
                {saleFilterDate === 'custom' && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="date" value={saleFilterDateFrom}
                      onChange={e => setSaleFilterDateFrom(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <span className="text-gray-400 text-sm flex-shrink-0">—</span>
                    <input
                      type="date" value={saleFilterDateTo}
                      onChange={e => setSaleFilterDateTo(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}

                {/* Поиск по товару */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={saleProductSearch}
                    onChange={e => setSaleProductSearch(e.target.value)}
                    placeholder="Поиск по названию товара..."
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  />
                </div>

                {/* Сброс */}
                {hasFilters && (
                  <div className="flex justify-end">
                    <button onClick={resetFilters} className="text-xs text-green-600 hover:underline">
                      Сбросить фильтры
                    </button>
                  </div>
                )}
              </div>

              {/* Список продаж */}
              {filteredSales.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                  {hasFilters ? 'Нет продаж по выбранным фильтрам' : 'Продаж нет'}
                </div>
              ) : (
                <div key={salesRefreshKey} className="space-y-3">
                  {filteredSales.map(s => {
                    const saleBranch = branches.find(b => b.id === s.branch_id);
                    return (
                    <div key={s.id}
                      className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 cursor-pointer active:bg-gray-50"
                      onClick={() => setSelectedSale(s)}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {(s.client as any)?.name || (s.client as any)?.phone || 'Без клиента'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(s.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {(s.employee as any)?.name}
                          </p>
                          {saleBranch && (
                            <p className="text-xs text-gray-400 mt-0.5">{saleBranch.name}</p>
                          )}
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
                      <div className="pt-2 border-t border-gray-50">
                        <span className="text-xs text-gray-500">
                          {s.payment_method === 'cash' ? '💵 Наличные' :
                           s.payment_method === 'kaspi_qr' ? '📱 Kaspi QR' : '💳 Смешанная'}
                          {s.paid_cash > 0 && s.paid_kaspi > 0 && (
                            <span className="ml-1 text-gray-400">
                              ({s.paid_cash.toLocaleString()}₸ + {s.paid_kaspi.toLocaleString()}₸)
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Остаток мастерской */}
                      {saleWorkshopRemainders[s.id] > 0 && (
                        <div className="pt-2 border-t border-orange-50">
                          <span className="text-xs text-orange-500 font-medium">
                            🔧 Остаток мастерской: ₸{saleWorkshopRemainders[s.id].toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  ); })}
                </div>
              )}
            </div>
          );
        })()}

        {/* СПИСАНИЯ */}
        {tab === 'writeoffs' && (() => {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
          const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

          const allWriteoffs = movements.filter(m => {
            if (m.type !== 'writeoff') return false;
            // для не-админа — только свой филиал
            if (role !== 'admin') {
              if ((m as any).branch_id !== activeBranchId) return false;
            }
            return true;
          });

          const filteredWriteoffs = allWriteoffs.filter(m => {
            const mDate = m.created_at.split('T')[0];
            if (woDateFilter === 'today' && mDate !== todayStr) return false;
            if (woDateFilter === 'week' && new Date(mDate) < weekAgo) return false;
            if (woDateFilter === 'month' && new Date(mDate) < monthAgo) return false;
            if (woDateFilter === 'custom') {
              if (woDateFrom && mDate < woDateFrom) return false;
              if (woDateTo && mDate > woDateTo) return false;
            }
            if (woProductSearch) {
              const name = ((m.product as any)?.name ?? '').toLowerCase();
              if (!name.includes(woProductSearch.toLowerCase())) return false;
            }
            return true;
          });

          const hasFilters = woDateFilter !== 'all' || !!woProductSearch;

          const dateOptions = [
            { value: 'all', label: 'Всё время' },
            { value: 'today', label: 'Сегодня' },
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
            { value: 'custom', label: 'Период' },
          ];

          return (
            <div className="space-y-3">

              {/* Заголовок + кнопка */}
              <div className="flex items-center justify-between gap-3">
                {hasFilters ? (
                  <p className="text-xs text-gray-400">
                    Найдено: <span className="font-medium text-gray-600">{filteredWriteoffs.length}</span> из {allWriteoffs.length}
                  </p>
                ) : <span />}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ExportBtn onClick={() => {
                    const rows = filteredWriteoffs.map(m => ({
                      'Дата': new Date(m.created_at).toLocaleDateString('ru-RU'),
                      'Товар': (m.product as any)?.name ?? '—',
                      'Артикул': (m.product as any)?.sku ?? '—',
                      'Количество': m.quantity,
                      'Причина': m.notes ?? '—',
                      'Сотрудник': (m.employee as any)?.name ?? '—',
                      'Филиал': branches.find(b => b.id === (m as any).branch_id)?.name ?? '—',
                    }));
                    xlsxExport(rows, `списания_${xlsxDate()}.xlsx`);
                  }} />
                  <button
                    onClick={() => setShowWriteoff(true)}
                    className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700"
                  >
                    <Plus size={16} />
                    Новое списание
                  </button>
                </div>
              </div>

              {/* Фильтр по дате */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingBottom: '4px' }}>
                {dateOptions.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setWoDateFilter(o.value)}
                    style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, border: woDateFilter === o.value ? 'none' : '1px solid #e5e7eb', backgroundColor: woDateFilter === o.value ? '#ea580c' : '#fff', color: woDateFilter === o.value ? '#fff' : '#4b5563', cursor: 'pointer' }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Произвольный период */}
              {woDateFilter === 'custom' && (
                <div className="flex gap-2 items-center">
                  <input type="date" value={woDateFrom} onChange={e => setWoDateFrom(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <span className="text-gray-400 text-sm flex-shrink-0">—</span>
                  <input type="date" value={woDateTo} onChange={e => setWoDateTo(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              )}

              {/* Поиск по товару */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={woProductSearch}
                  onChange={e => setWoProductSearch(e.target.value)}
                  placeholder="Поиск по названию товара..."
                  className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                />
              </div>

              {/* Сброс */}
              {hasFilters && (
                <div className="flex justify-end">
                  <button
                    onClick={() => { setWoDateFilter('all'); setWoDateFrom(''); setWoDateTo(''); setWoProductSearch(''); }}
                    className="text-xs text-orange-600 hover:underline"
                  >
                    Сбросить фильтры
                  </button>
                </div>
              )}

              {/* Список списаний */}
              {filteredWriteoffs.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                  {hasFilters ? 'Нет списаний по выбранным фильтрам' : 'Списаний нет'}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {filteredWriteoffs.map(m => {
                    const branchName = branches.find(b => b.id === (m as any).branch_id)?.name;
                    return (
                      <div
                        key={m.id}
                        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100"
                        onClick={() => setSelectedMovementId(m.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {(m.product as any)?.name ?? '—'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {m.notes ? m.notes : <span className="italic text-gray-300">Причина не указана</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {(m.employee as any)?.name ?? '—'}
                            {branchName ? ` · ${branchName}` : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-semibold text-orange-600">−{m.quantity} шт</span>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(m.created_at).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ВОЗВРАТЫ */}
        {tab === 'returns' && (() => {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
          const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

          const allReturns = movements.filter(m => {
            if (m.type !== 'return') return false;
            if (role !== 'admin' && (m as any).branch_id !== activeBranchId) return false;
            return true;
          });

          const filteredReturns = allReturns.filter(m => {
            if (role === 'admin' && retFilterBranch && (m as any).branch_id !== retFilterBranch) return false;
            const mDate = m.created_at.split('T')[0];
            if (retFilterDate === 'today' && mDate !== todayStr) return false;
            if (retFilterDate === 'week' && new Date(mDate) < weekAgo) return false;
            if (retFilterDate === 'month' && new Date(mDate) < monthAgo) return false;
            if (retFilterDate === 'custom') {
              if (retFilterDateFrom && mDate < retFilterDateFrom) return false;
              if (retFilterDateTo && mDate > retFilterDateTo) return false;
            }
            if (retProductSearch) {
              const name = ((m.product as any)?.name ?? '').toLowerCase();
              if (!name.includes(retProductSearch.toLowerCase())) return false;
            }
            return true;
          });

          const hasFilters = retFilterDate !== 'all' || !!retProductSearch || (role === 'admin' && !!retFilterBranch);

          const dateOptions = [
            { value: 'all', label: 'Всё время' },
            { value: 'today', label: 'Сегодня' },
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
            { value: 'custom', label: 'Период' },
          ];

          return (
            <div className="space-y-3">

              {/* Заголовок + кнопка */}
              <div className="flex items-center justify-between gap-3">
                {hasFilters ? (
                  <p className="text-xs text-gray-400">
                    Найдено: <span className="font-medium text-gray-600">{filteredReturns.length}</span> из {allReturns.length}
                  </p>
                ) : <span />}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ExportBtn onClick={() => {
                    const grps: Map<string, typeof filteredReturns> = new Map();
                    filteredReturns.forEach(m => {
                      const k = m.reference_id ?? m.id;
                      if (!grps.has(k)) grps.set(k, []);
                      grps.get(k)!.push(m);
                    });
                    const rows = Array.from(grps.values()).map(mvs => {
                      const first = mvs[0];
                      const rs = first.reference_id ? sales.find(s => s.id === first.reference_id) : null;
                      return {
                        'Дата': new Date(first.created_at).toLocaleDateString('ru-RU'),
                        'Клиент': rs ? ((rs.client as any)?.name || (rs.client as any)?.phone || '—') : '—',
                        'Товары': mvs.map(m => `${(m.product as any)?.name} ×${m.quantity}`).join('; '),
                        'Причина': first.notes ?? '—',
                        'Сотрудник': (first.employee as any)?.name ?? '—',
                        'Филиал': branches.find(b => b.id === (first as any).branch_id)?.name ?? '—',
                      };
                    });
                    xlsxExport(rows, `возвраты_${xlsxDate()}.xlsx`);
                  }} />
                  <button
                    onClick={() => setShowReturnModal(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
                  >
                    <Plus size={16} />
                    Новый возврат
                  </button>
                </div>
              </div>

              {/* Фильтр по филиалу (только admin) */}
              {role === 'admin' && (
                <select
                  value={retFilterBranch}
                  onChange={e => setRetFilterBranch(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Все филиалы</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.is_warehouse ? '🏭 ' : ''}{b.name}</option>
                  ))}
                </select>
              )}

              {/* Фильтр по дате */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingBottom: '4px' }}>
                {dateOptions.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setRetFilterDate(o.value)}
                    style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, border: retFilterDate === o.value ? 'none' : '1px solid #e5e7eb', backgroundColor: retFilterDate === o.value ? '#2563eb' : '#fff', color: retFilterDate === o.value ? '#fff' : '#4b5563', cursor: 'pointer' }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Произвольный период */}
              {retFilterDate === 'custom' && (
                <div className="flex gap-2 items-center">
                  <input type="date" value={retFilterDateFrom} onChange={e => setRetFilterDateFrom(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-gray-400 text-sm flex-shrink-0">—</span>
                  <input type="date" value={retFilterDateTo} onChange={e => setRetFilterDateTo(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}

              {/* Поиск по товару */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={retProductSearch}
                  onChange={e => setRetProductSearch(e.target.value)}
                  placeholder="Поиск по названию товара..."
                  className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>

              {/* Сброс */}
              {hasFilters && (
                <div className="flex justify-end">
                  <button
                    onClick={() => { setRetFilterDate('all'); setRetFilterDateFrom(''); setRetFilterDateTo(''); setRetFilterBranch(''); setRetProductSearch(''); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Сбросить фильтры
                  </button>
                </div>
              )}

              {/* Список возвратов — карточки */}
              {filteredReturns.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                  {hasFilters ? 'Нет возвратов по выбранным фильтрам' : 'Возвратов нет'}
                </div>
              ) : (() => {
                // Группируем по reference_id (sale_id): одна карточка = один возврат
                const groups: Map<string, StockMovement[]> = new Map();
                filteredReturns.forEach(m => {
                  const key = m.reference_id ?? m.id;
                  if (!groups.has(key)) groups.set(key, []);
                  groups.get(key)!.push(m);
                });

                return (
                  <div className="space-y-3">
                    {Array.from(groups.entries()).map(([groupKey, mvs]) => {
                      const firstMv = mvs[0];
                      const relatedSale = firstMv.reference_id
                        ? sales.find(s => s.id === firstMv.reference_id)
                        : null;
                      const clientName = relatedSale
                        ? ((relatedSale.client as any)?.name || (relatedSale.client as any)?.phone || 'Без клиента')
                        : 'Без клиента';
                      const employeeName = (firstMv.employee as any)?.name ?? '—';
                      const date = new Date(firstMv.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                      const retBranchName = branches.find(b => b.id === (firstMv as any).branch_id)?.name;

                      const totalAmount = mvs.reduce((sum, m) => {
                        const unitPrice = (m as any).price
                          ?? relatedSale?.items?.find(i => i.product_id === m.product_id)?.price
                          ?? 0;
                        return sum + m.quantity * unitPrice;
                      }, 0);

                      return (
                        <div key={groupKey}
                          className="bg-white border border-gray-100 rounded-xl p-4 space-y-3 cursor-pointer active:bg-gray-50"
                          onClick={() => setSelectedMovementId(firstMv.id)}
                        >
                          {/* Заголовок */}
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{clientName}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{date} · {employeeName}</p>
                              {retBranchName && <p className="text-xs text-gray-400 mt-0.5">{retBranchName}</p>}
                            </div>
                            <div className="text-right">
                              {totalAmount > 0 && (
                                <p className="text-base font-bold text-gray-900">−₸{totalAmount.toLocaleString()}</p>
                              )}
                              <StatusBadge status="refunded" />
                            </div>
                          </div>

                          {/* Товары */}
                          <div className="space-y-1">
                            {(retExpanded.has(groupKey) ? mvs : mvs.slice(0, 3)).map((m, idx) => {
                              const unitPrice = (m as any).price
                                ?? relatedSale?.items?.find(i => i.product_id === m.product_id)?.price
                                ?? 0;
                              return (
                                <div key={idx} className="flex justify-between text-xs text-gray-500">
                                  <span>{(m.product as any)?.name ?? '—'} × {m.quantity}</span>
                                  {unitPrice > 0 && <span>₸{(m.quantity * unitPrice).toLocaleString()}</span>}
                                </div>
                              );
                            })}
                            {mvs.length > 3 && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setRetExpanded(prev => {
                                    const next = new Set(prev);
                                    next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
                                    return next;
                                  });
                                }}
                                className="text-xs text-blue-500 hover:text-blue-700 font-medium mt-0.5"
                              >
                                {retExpanded.has(groupKey) ? 'Скрыть' : `+ ещё ${mvs.length - 3} позиций`}
                              </button>
                            )}
                          </div>

                          {/* Метод оплаты из связанной продажи */}
                          {relatedSale && (
                            <div className="pt-2 border-t border-gray-50">
                              <span className="text-xs text-gray-500">
                                {relatedSale.payment_method === 'cash' ? '💵 Наличные' :
                                 relatedSale.payment_method === 'kaspi_qr' ? '📱 Kaspi QR' : '💳 Смешанная'}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* РЕВИЗИИ */}
        {tab === 'revisions' && (() => {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0];
          const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
          const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);

          const filteredRevisions = revisions.filter(r => {
            if ((r as any).branch_id !== activeBranchId) return false;
            if (rvFilterStatus !== 'all' && r.status !== rvFilterStatus) return false;
            const rDate = r.created_at.split('T')[0];
            if (rvDateFilter === 'today' && rDate !== todayStr) return false;
            if (rvDateFilter === 'week' && new Date(rDate) < weekAgo) return false;
            if (rvDateFilter === 'month' && new Date(rDate) < monthAgo) return false;
            if (rvDateFilter === 'custom') {
              if (rvDateFrom && rDate < rvDateFrom) return false;
              if (rvDateTo && rDate > rvDateTo) return false;
            }
            if (rvProductSearch) {
              const found = r.items?.some(i =>
                (i.product as any)?.name?.toLowerCase().includes(rvProductSearch.toLowerCase())
              );
              if (!found) return false;
            }
            return true;
          });

          const hasFilters = !!(rvFilterStatus !== 'all' || rvDateFilter !== 'all' || rvProductSearch);

          const resetFilters = () => {
            setRvFilterStatus('all');
            setRvDateFilter('all'); setRvDateFrom(''); setRvDateTo('');
            setRvProductSearch('');
          };

          const statusOptions = [
            { value: 'all', label: 'Все статусы' },
            { value: 'in_progress', label: 'Активна' },
            { value: 'completed', label: 'Завершена' },
          ];

          const dateOptions = [
            { value: 'all', label: 'Всё время' },
            { value: 'today', label: 'Сегодня' },
            { value: 'week', label: 'Неделя' },
            { value: 'month', label: 'Месяц' },
            { value: 'custom', label: 'Период' },
          ];

          return (
            <div className="space-y-4">

              {/* Кнопка + счётчик */}
              <div className="flex items-center justify-between gap-3">
                {hasFilters ? (
                  <p className="text-xs text-gray-400">
                    Показано: <span className="font-medium text-gray-600">{filteredRevisions.length}</span> из {revisions.length}
                  </p>
                ) : <span />}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <ExportBtn onClick={() => {
                    const rows = filteredRevisions.map(r => {
                      const items = r.items ?? [];
                      const counted = items.filter(i => i.actual_qty != null);
                      const surplus = counted.reduce((s, i) => (i.difference ?? 0) > 0 ? s + (i.difference ?? 0) : s, 0);
                      const shortage = counted.reduce((s, i) => (i.difference ?? 0) < 0 ? s + Math.abs(i.difference ?? 0) : s, 0);
                      return {
                        'Дата': new Date(r.created_at).toLocaleDateString('ru-RU'),
                        'Статус': STATUS_RU[r.status] ?? r.status,
                        'Позиций всего': items.length,
                        'Подсчитано': counted.length,
                        'Излишки (шт)': surplus,
                        'Недостачи (шт)': shortage,
                        'Дата завершения': r.completed_at ? new Date(r.completed_at).toLocaleDateString('ru-RU') : '—',
                      };
                    });
                    xlsxExport(rows, `ревизии_${xlsxDate()}.xlsx`);
                  }} />
                  {role !== 'manager' && (
                    <button
                      onClick={() => setShowRevision(true)}
                      className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700"
                    >
                      <QrCode size={16} />
                      Начать ревизию
                    </button>
                  )}
                </div>
              </div>

              {/* Фильтры */}
              <div className="space-y-3">

                {/* Статус */}
                <div>
                  <select
                    value={rvFilterStatus}
                    onChange={e => setRvFilterStatus(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    {statusOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Дата */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {dateOptions.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setRvDateFilter(o.value)}
                      style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: rvDateFilter === o.value ? 'none' : '1px solid #e5e7eb', backgroundColor: rvDateFilter === o.value ? '#7c3aed' : '#fff', color: rvDateFilter === o.value ? '#fff' : '#4b5563' }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {/* Произвольный период */}
                {rvDateFilter === 'custom' && (
                  <div className="flex gap-2 items-center">
                    <input type="date" value={rvDateFrom} onChange={e => setRvDateFrom(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    <span className="text-gray-400 text-sm flex-shrink-0">—</span>
                    <input type="date" value={rvDateTo} onChange={e => setRvDateTo(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                  </div>
                )}

                {/* Поиск по товару */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={rvProductSearch}
                    onChange={e => setRvProductSearch(e.target.value)}
                    placeholder="Поиск по названию товара в ревизии..."
                    className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                  />
                </div>

                {/* Сброс */}
                {hasFilters && (
                  <div className="flex justify-end">
                    <button onClick={resetFilters} className="text-xs text-purple-600 hover:underline">
                      Сбросить фильтры
                    </button>
                  </div>
                )}
              </div>

              {/* Список */}
              {filteredRevisions.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
                  {hasFilters ? 'Нет ревизий по выбранным фильтрам' : 'Ревизий нет'}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRevisions.map(r => {
                    const ritems = r.items ?? [];
                    const counted = ritems.filter(i => i.actual_qty != null).length;
                    const withDiff = ritems.filter(i => i.actual_qty != null).reduce((sum, i) => sum + Math.abs(i.difference ?? 0), 0);
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
          );
        })()}
      </div>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          stock={stock.find(s => s.product_id === selectedProduct.id)?.quantity ?? 0}
          branchId={activeBranchId}
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
          branchId={activeBranchId}
          employeeId={employeeId}
          role={role}
          onClose={() => setShowTransfer(false)}
          onSuccess={() => { loadAll(); setShowTransfer(false); }}
        />
      )}

      {showWriteoff && (
        <WriteoffModal
          branchId={activeBranchId}
          employeeId={employeeId}
          role={role}
          onClose={() => setShowWriteoff(false)}
          onSuccess={() => { loadAll(); setShowWriteoff(false); }}
        />
      )}

      {showReturnModal && (
        <ReturnModal
          sales={sales}
          employeeId={employeeId}
          onClose={() => setShowReturnModal(false)}
          onSuccess={handleReturnSuccess}
        />
      )}

      {selectedMovementId && (
        <MovementDetailModal
          movementId={selectedMovementId}
          onClose={() => setSelectedMovementId(null)}
        />
      )}

      {showIncomingTransfers && (
        <IncomingTransfersModal
          branchId={activeBranchId}
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

      {showScanner && (
        <BarcodeScanner
          onDetected={barcode => {
            setSearch(barcode);
            setShowScanner(false);
            const found = products.find(p => p.barcode === barcode || p.sku === barcode);
            if (found) {
              setHighlightedProductId(found.id);
              setTimeout(() => setHighlightedProductId(null), 5000);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
      {showAddProduct && (
        <AddProductModal
          branchId={activeBranchId}
          employeeId={employeeId}
          onClose={() => setShowAddProduct(false)}
          onSuccess={loadAll}
        />
      )}
      {showAddPurchase && (
        <AddPurchaseModal
          branchId={activeBranchId}
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
              <div className="flex justify-between py-1">
                <span className="text-gray-500 text-sm">Филиал</span>
                <span className="text-sm">{branches.find(b => b.id === selectedSale.branch_id)?.name ?? '—'}</span>
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

              {/* Заказ мастерской */}
              {saleWorkshopOrder && (() => {
                const order = saleWorkshopOrder;
                const wsTotal = order.service_price + order.parts_price;
                // Fallback для старых записей без original_prepayment
                const origPrepayment = order.original_prepayment || order.prepayment;
                const wsRemainder = order.original_prepayment != null
                  ? wsTotal - order.original_prepayment
                  : wsTotal - order.prepayment;
                const wsFullyPaid =
                  order.status === 'done' ||
                  !!order.remaining_paid_at ||
                  origPrepayment >= wsTotal;
                return (
                  <div className="border-t border-purple-100 pt-3 space-y-2">
                    <p className="text-xs font-semibold text-purple-600">🔧 Заказ мастерской</p>
                    <p className="text-sm font-medium text-gray-900">{order.service_name}</p>
                    {order.service_price > 0 && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Услуга:</span>
                        <span>₸{order.service_price.toLocaleString()}</span>
                      </div>
                    )}
                    {order.parts_price > 0 && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Запчасти:</span>
                        <span>₸{order.parts_price.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-semibold text-gray-900">
                      <span>Итого:</span>
                      <span>₸{wsTotal.toLocaleString()}</span>
                    </div>
                    {origPrepayment > 0 && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Предоплата{order.prepayment_method ? ` (${order.prepayment_method === 'cash' ? 'Наличные' : 'Kaspi'})` : ''}:</span>
                        <span>₸{origPrepayment.toLocaleString()}</span>
                      </div>
                    )}
                    {order.remaining_paid_at && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Доплата{order.remaining_payment_method ? ` (${order.remaining_payment_method === 'cash' ? 'Наличные' : 'Kaspi'})` : ''}:</span>
                        <span>₸{Math.max(0, wsTotal - origPrepayment).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-medium">
                      {wsFullyPaid ? (
                        <span className="text-green-600">✓ Оплачено</span>
                      ) : (
                        <>
                          <span className="text-red-500">Остаток:</span>
                          <span className="text-red-500">₸{Math.max(0, wsRemainder).toLocaleString()}</span>
                        </>
                      )}
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Статус:</span>
                      <span>{WS_STATUS_RU[order.status] ?? order.status}</span>
                    </div>
                    {order.created_branch?.name && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Филиал:</span>
                        <span>{order.created_branch.name}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              {(selectedSale.status === 'paid' || selectedSale.status === 'partially_refunded') && (
                <button
                  onClick={() => setShowSaleReturn(true)}
                  className="px-4 py-2 border border-red-300 text-red-500 rounded-lg text-sm font-medium"
                >
                  Возврат
                </button>
              )}
              <button onClick={() => setSelectedSale(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaleReturn && selectedSale && (
        <ReturnModal
          sales={[selectedSale]}
          initialSaleId={selectedSale.id}
          employeeId={employeeId}
          onClose={() => setShowSaleReturn(false)}
          onSuccess={handleSaleDetailReturnSuccess}
        />
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
                const counted = ritems.filter(i => i.actual_qty != null);
                const surplus = counted.reduce((sum, i) => (i.difference ?? 0) > 0 ? sum + (i.difference ?? 0) : sum, 0);
                const shortage = counted.reduce((sum, i) => (i.difference ?? 0) < 0 ? sum + Math.abs(i.difference ?? 0) : sum, 0);
                return (
                  <div className="flex gap-3">
                    <div className="flex-1 bg-green-50 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-green-600 font-medium">Излишки</p>
                      <p className="text-lg font-bold text-green-700">{surplus} <span className="text-sm font-normal">шт</span></p>
                    </div>
                    <div className="flex-1 bg-red-50 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-red-600 font-medium">Недостачи</p>
                      <p className="text-lg font-bold text-red-700">{shortage} <span className="text-sm font-normal">шт</span></p>
                    </div>
                    <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-center">
                      <p className="text-xs text-gray-500 font-medium">Всего</p>
                      <p className="text-lg font-bold text-gray-700">{ritems.filter(i => i.actual_qty != null).length}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Позиции */}
              {(() => {
                const allItems = selectedRevision.items ?? [];
                const counted = allItems
                  .filter(i => i.actual_qty != null)
                  .sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0));
                const uncounted = allItems.filter(i => i.actual_qty == null);

                const renderItem = (item: typeof allItems[0], idx: number) => {
                  const diff = item.difference ?? 0;
                  const isNull = item.actual_qty == null;
                  const rowCls = isNull
                    ? 'border-gray-100 bg-gray-50'
                    : diff === 0 ? 'border-green-100 bg-green-50'
                    : diff > 0   ? 'border-green-100 bg-green-50'
                    :              'border-red-100 bg-red-50';
                  const badgeCls = isNull
                    ? 'bg-gray-100 text-gray-400'
                    : diff === 0 ? 'bg-green-100 text-green-600'
                    : diff > 0   ? 'bg-green-100 text-green-700'
                    :              'bg-red-100 text-red-600';
                  const badgeText = isNull ? '—' : diff > 0 ? `+${diff}` : diff === 0 ? '✓' : String(diff);

                  return (
                    <div key={idx} className={`flex items-start justify-between py-2 px-3 rounded-lg border ${rowCls}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isNull ? 'text-gray-400' : 'text-gray-900'}`}>
                          {(item.product as any)?.name}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Ожид: {item.expected_qty} · Факт: {item.actual_qty ?? '—'}
                        </p>
                        {!isNull && diff < 0 && (
                          <p className="text-xs text-red-500 font-medium mt-0.5">Недостача: {Math.abs(diff)} шт</p>
                        )}
                        {!isNull && diff > 0 && (
                          <p className="text-xs text-green-600 font-medium mt-0.5">Излишек: {diff} шт</p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ml-3 flex-shrink-0 mt-0.5 ${badgeCls}`}>
                        {badgeText}
                      </span>
                    </div>
                  );
                };

                return (
                  <div className="border-t border-gray-100 pt-3 space-y-3">
                    {counted.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">
                          Подсчитано ({counted.length})
                        </p>
                        <div className="space-y-1.5">
                          {counted.map((item, idx) => renderItem(item, idx))}
                        </div>
                      </div>
                    )}
                    {uncounted.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 mb-1.5">
                          Не подсчитано ({uncounted.length})
                        </p>
                        <div className="space-y-1.5">
                          {uncounted.map((item, idx) => renderItem(item, idx + counted.length))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
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
          branchId={activeBranchId}
          employeeId={employeeId}
          onClose={() => setShowAddSale(false)}
          onSuccess={loadAll}
        />
      )}
      {showSuppliers && (
        <SuppliersModal onClose={() => setShowSuppliers(false)} />
      )}

      {showLowStock && (
        <LowStockModal
          alerts={alerts}
          branchId={role === 'admin' ? undefined : activeBranchId}
          onClose={() => setShowLowStock(false)}
        />
      )}
      {selectedBranch && (
        <BranchDetailModal
          branch={selectedBranch}
          onClose={() => setSelectedBranch(null)}
        />
      )}

      {showRevision && (
        <RevisionModal
          branchId={activeBranchId}
          employeeId={employeeId}
          existingRevisionId={continueRevisionId}
          onClose={() => { setShowRevision(false); setContinueRevisionId(undefined); }}
          onSuccess={async () => { await loadAll(); setContinueRevisionId(undefined); }}
          role={role}
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

function MovementsTable({ movements, emptyText = 'Движений нет', onRowClick, role }: { movements: StockMovement[]; emptyText?: string; onRowClick?: (id: string) => void; role?: string }) {
  const typeLabel: Record<string, { label: string; color: string }> = {
    in: { label: 'Приход', color: 'text-green-600' },
    out: { label: 'Расход', color: 'text-red-600' },
    transfer: { label: 'Перемещение', color: 'text-blue-600' },
    writeoff: { label: 'Списание', color: 'text-orange-600' },
    revision_adjust: { label: 'Корректировка', color: 'text-purple-600' },
    return: { label: 'Возврат', color: 'text-blue-500' },
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
              <div key={m.id} className={`grid grid-cols-12 items-center px-4 py-3 ${onRowClick ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' : ''} ${role === 'admin' && m.type === 'transfer' && m.discrepancy > 0 ? 'bg-red-50 border-l-4 border-red-400' : ''}`} onClick={() => onRowClick?.(m.id)}>
                <div className="col-span-4">
                  <p className="text-sm text-gray-900">{(m.product as any)?.name ?? '—'}</p>
                  {m.type === 'transfer' && m.notes
                    ? <p className="text-xs text-gray-400">{m.notes}</p>
                    : <p className="text-xs text-gray-400">{(m.employee as any)?.name ?? '—'}</p>
                  }
                </div>
                <div className="col-span-3">
                  <span className={`text-sm font-medium ${t.color}`}>{t.label}</span>
                  {role === 'admin' && m.type === 'transfer' && m.discrepancy > 0 && (
                    <div className="text-xs text-red-500 font-medium mt-0.5">
                      Недостача: {m.discrepancy} шт · ₸{((m.discrepancy ?? 0) * (m.price ?? 0)).toLocaleString('ru-RU')}
                    </div>
                  )}
                </div>
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
    partially_refunded: { label: 'Частичный возврат', className: 'bg-amber-100 text-amber-700' },
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

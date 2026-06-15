import { useState, useEffect, useRef } from 'react';
import { X, Search, QrCode, Trash2, ChevronDown, Plus, Check, Wrench } from 'lucide-react';
import { createSale, getProductsFromStock, getProductByBarcode } from '../../services/inventory';
import { createServiceOrder, fetchServices, createService } from '../../services/workshop';
import { createOrder } from '../../services/orders';
import { supabase } from '../../services/supabase';
import { formatPhone } from '@/utils/formatters';
import BarcodeScanner from '../Shared/BarcodeScanner';
import KaspiQRModal from './KaspiQRModal';
import type { Product, Client, Service } from '../../types';

const WORKSHOP_BRANCH_ID = '1104bc27-07bb-4930-93b2-19a2d92b71c9';
type WorkshopPaymentType = 'prepaid' | 'full' | 'on_delivery';

interface SaleItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  stock_qty: number;
}

interface Props {
  branchId: string;
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
  initialTab?: 'sale' | 'preorder';
}

type ClientSnap = Pick<Client, 'id' | 'phone'> & { name?: string; branch?: { name: string } | null };

export default function AddSaleModal({ branchId, employeeId, onClose, onSuccess, initialTab }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<ClientSnap[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientSnap | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'kaspi_qr' | 'mixed'>('cash');
  const [paidCash, setPaidCash] = useState('');
  const [paidKaspi, setPaidKaspi] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showKaspiQR, setShowKaspiQR] = useState(false);
  const [tempSaleId, setTempSaleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [change, setChange] = useState(0);

  // Состояния мастерской
  const [workshopServices, setWorkshopServices] = useState<Service[]>([]);
  const [addWorkshop, setAddWorkshop] = useState(false);
  const [workshopServiceId, setWorkshopServiceId] = useState('');
  const [workshopServiceName, setWorkshopServiceName] = useState('');
  const [workshopServicePrice, setWorkshopServicePrice] = useState(0);
  const [workshopPartsPrice, setWorkshopPartsPrice] = useState(0);
  const [workshopNotes, setWorkshopNotes] = useState('');
  const [workshopPaymentType, setWorkshopPaymentType] = useState<WorkshopPaymentType>('on_delivery');
  const [workshopShowServiceList, setWorkshopShowServiceList] = useState(false);
  const [workshopShowCreateService, setWorkshopShowCreateService] = useState(false);
  const [workshopPrepayment, setWorkshopPrepayment] = useState(0);

  const [newWsServiceName, setNewWsServiceName] = useState('');
  const [newWsServicePrice, setNewWsServicePrice] = useState(0);
  const [creatingWsService, setCreatingWsService] = useState(false);

  // Локальные raw-строки для числовых полей товаров (iOS: свободный ввод без зажима)
  const [rawQuantity, setRawQuantity] = useState<Record<string, string>>({});
  const [rawPrice, setRawPrice] = useState<Record<string, string>>({});

  // client UI state
  const [clientsLoading, setClientsLoading] = useState(false);
  const [showClientList, setShowClientList] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<ClientSnap[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newClientSaving, setNewClientSaving] = useState(false);

  // Режим: продажа / предзаказ
  const [mode, setMode] = useState<'sale' | 'preorder'>(initialTab ?? 'sale');

  // Состояния предзаказа
  const [preorderPaymentType, setPreorderPaymentType] = useState<'none' | 'prepaid' | 'full'>('none');
  const [prepaymentAmount, setPrepaymentAmount] = useState('');
  const [prepaymentMethod, setPrepaymentMethod] = useState<'cash' | 'kaspi'>('cash');
  const [expectedDate, setExpectedDate] = useState('');
  const [preorderNotes, setPreorderNotes] = useState('');
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    getProductsFromStock(branchId).then(data =>
      setProducts([...data].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
    );
    fetchBranchClients();
    fetchServices(WORKSHOP_BRANCH_ID).then(setWorkshopServices).catch(console.error);
  }, [branchId]);

  async function fetchBranchClients() {
    setClientsLoading(true);
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, name, phone')
        .eq('branch_id', branchId)
        .order('name', { ascending: true });
      setClients((data ?? []) as ClientSnap[]);
    } catch (e) {
      console.error('[AddSaleModal] fetchBranchClients:', e);
    }
    setClientsLoading(false);
  }

  async function searchClientsByName(query: string) {
    if (!query.trim()) { setNameSuggestions([]); setShowSuggestions(false); return; }
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, branch:branches(name)')
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
      .limit(7);
    setNameSuggestions((data ?? []) as ClientSnap[]);
    setShowSuggestions(true);
  }

  async function handleCreateClient() {
    if (!newClientPhone.trim()) return;
    setNewClientSaving(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: newClientName.trim() || null,
          phone: newClientPhone.trim(),
          branch_id: branchId,
          status: 'new',
          contact_type: 'visit',
        })
        .select('id, name, phone')
        .single();

      if (error) throw error;
      const snap = data as ClientSnap;
      setClientId(snap.id);
      setSelectedClient(snap);
      setClients(prev => [snap, ...prev]);
      setShowNewClientForm(false);
      setNewClientName('');
      setNewClientPhone('');
      setNameSuggestions([]);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    }
    setNewClientSaving(false);
  }

  // Свайп для закрытия
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => { start.x = e.touches[0].clientX; start.y = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (dx > 60 && dy < 80) onClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
  }, []);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const total = items.reduce((sum, i) => sum + i.quantity * i.price, 0);

  // Сумма мастерской, которую клиент платит прямо сейчас
  const workshopAmountNow = addWorkshop
    ? workshopPaymentType === 'full'
      ? workshopServicePrice + workshopPartsPrice
      : workshopPaymentType === 'prepaid'
        ? workshopPrepayment
        : 0
    : 0;

  const totalNow = total + workshopAmountNow;

  useEffect(() => {
    if (paymentMethod === 'cash') {
      setChange(Math.max(0, parseFloat(paidCash || '0') - totalNow));
    } else if (paymentMethod === 'mixed') {
      const paid = parseFloat(paidCash || '0') + parseFloat(paidKaspi || '0');
      setChange(Math.max(0, paid - totalNow));
    }
  }, [paidCash, paidKaspi, totalNow, paymentMethod]);

  // Изменение 3: автозаполнение "Получено наличными" при изменении итога
  useEffect(() => {
    setPaidCash(totalNow > 0 ? String(totalNow) : '');
  }, [totalNow]);

  const addItem = (product: Product) => {
    const stockQty = (product.stock as any)?.find((s: any) => s.branch_id === branchId)?.quantity ?? 0;
    setItems(prev => {
      const existing = prev.findIndex(i => i.product_id === product.id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing ? { ...item, quantity: Math.min(item.quantity + 1, stockQty) } : item
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        price: product.price,
        stock_qty: stockQty,
      }];
    });
    setSearch(product.name);
    setShowSearch(false);
  };

  const handleBarcodeDetected = async (barcode: string) => {
    try {
      const product = await getProductByBarcode(barcode);
      addItem(product);
    } catch {
      alert('Товар не найден');
    }
    setShowScanner(false);
  };

  const updateItem = (idx: number, field: 'quantity' | 'price', value: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === 'quantity') return { ...item, quantity: Math.min(Math.max(1, value), item.stock_qty) };
      return { ...item, [field]: value };
    }));
  };

  const removeItem = (idx: number) => {
    const productId = items[idx]?.product_id;
    setItems(prev => prev.filter((_, i) => i !== idx));
    if (productId) {
      setRawQuantity(prev => { const next = { ...prev }; delete next[productId]; return next; });
      setRawPrice(prev => { const next = { ...prev }; delete next[productId]; return next; });
    }
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    if (mode === 'preorder') {
      setLoading(true);
      try {
        const orderClientName = selectedClient?.name ?? newClientName ?? undefined;
        const orderClientPhone = selectedClient?.phone ?? newClientPhone ?? undefined;
        await createOrder({
          branch_id: branchId,
          created_by: employeeId,
          client_id: clientId || null,
          client_name: orderClientName,
          client_phone: orderClientPhone,
          payment_type: preorderPaymentType,
          prepayment_amount: preorderPaymentType === 'prepaid' ? parseFloat(prepaymentAmount || '0') : 0,
          prepayment_method: preorderPaymentType === 'prepaid' ? prepaymentMethod : null,
          total_amount: total,
          expected_date: expectedDate || null,
          notes: preorderNotes.trim() || undefined,
          items: items.map(i => ({
            product_id: i.product_id || null,
            product_name: i.product_name,
            quantity: i.quantity,
            price: i.price,
          })),
        });
        window.dispatchEvent(new CustomEvent('preorder-created'));
        onClose();
      } catch (e: any) {
        alert('Ошибка: ' + (e?.message || JSON.stringify(e)));
      } finally {
        isSubmittingRef.current = false;
        setLoading(false);
      }
      return;
    }

    if (items.length === 0 && !addWorkshop) { isSubmittingRef.current = false; return; }
    setLoading(true);
    try {
      const cashAmount = paymentMethod === 'cash' ? total :
        paymentMethod === 'kaspi_qr' ? 0 : parseFloat(paidCash || '0');
      const kaspiAmount = paymentMethod === 'kaspi_qr' ? total :
        paymentMethod === 'cash' ? 0 : parseFloat(paidKaspi || '0');

      const needsKaspi = paymentMethod === 'kaspi_qr' || paymentMethod === 'mixed';
      const initialStatus = needsKaspi ? 'pending' : 'paid';

      const sale = await createSale(
        {
          branch_id: branchId,
          client_id: clientId || undefined,
          employee_id: employeeId,
          payment_method: paymentMethod,
          status: initialStatus,
          total,
          paid_cash: cashAmount,
          paid_kaspi: kaspiAmount,
          notes: notes || undefined,
        },
        items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          price: i.price,
        }))
      );

      // Создать заказ в мастерскую вместе с продажей (если включён чекбокс)
      if (addWorkshop && workshopServiceName.trim()) {
        const clientName = selectedClient?.name ?? selectedClient?.phone ?? 'Клиент';
        const clientPhone = selectedClient?.phone ?? '';
        const wsTotal = workshopServicePrice + workshopPartsPrice;
        const wsPrepayment = workshopPaymentType === 'full'
          ? wsTotal
          : workshopPaymentType === 'prepaid'
            ? workshopPrepayment
            : 0;
        await createServiceOrder({
          branch_id: WORKSHOP_BRANCH_ID,
          created_branch_id: branchId,
          client_name: clientName,
          client_phone: clientPhone,
          employee_id: employeeId,
          service_id: workshopServiceId || undefined,
          service_name: workshopServiceName.trim(),
          service_price: workshopServicePrice,
          parts_price: workshopPartsPrice,
          prepayment: wsPrepayment,
          payment_type: workshopPaymentType,
          notes: workshopNotes.trim() || undefined,
          sale_id: sale.id,
          prepayment_method: wsPrepayment > 0 ? (paymentMethod === 'kaspi_qr' ? 'kaspi' : 'cash') : undefined,
          prepayment_paid_at: wsPrepayment > 0 ? new Date().toISOString() : undefined,
        });
      }

      if (needsKaspi) {
        setTempSaleId(sale.id);
        setShowKaspiQR(true);
        setLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (e: any) {
      alert('Ошибка: ' + (e?.message || JSON.stringify(e)));
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const handleKaspiConfirm = async () => {
    if (!tempSaleId) return;
    await supabase.from('sales').update({ status: 'paid' }).eq('id', tempSaleId);
    setShowKaspiQR(false);
    onSuccess();
    onClose();
  };

  const handleKaspiCancel = async () => {
    if (tempSaleId) {
      await supabase.from('sale_items').delete().eq('sale_id', tempSaleId);
      await supabase.from('sales').delete().eq('id', tempSaleId);
    }
    setShowKaspiQR(false);
  };

  // Отображаемое имя выбранного клиента
  const displayClientName = selectedClient
    ? (selectedClient.name || selectedClient.phone)
    : clientId
      ? (clients.find(c => c.id === clientId)?.name || clients.find(c => c.id === clientId)?.phone)
      : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
        <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">
              {mode === 'preorder' ? 'Новый предзаказ' : 'Новая продажа'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            {/* ── Клиент ── */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Клиент</label>

              {/* Trigger */}
              <button
                type="button"
                onClick={() => { setShowClientList(v => !v); setShowNewClientForm(false); }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <span className={displayClientName ? 'text-gray-900' : 'text-gray-400'}>
                  {displayClientName ?? '— без клиента —'}
                </span>
                <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
              </button>

              {/* Dropdown */}
              {showClientList && (
                <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-lg overflow-hidden">
                  {/* + Новый клиент */}
                  <button
                    onMouseDown={e => { e.preventDefault(); setShowNewClientForm(true); setShowClientList(false); }}
                    className="w-full text-left px-4 py-3 text-sm font-medium text-green-600 hover:bg-green-50 border-b border-gray-100 flex items-center gap-2"
                  >
                    <Plus size={14} />
                    Новый клиент
                  </button>

                  {/* — без клиента — */}
                  <button
                    onMouseDown={e => {
                      e.preventDefault();
                      setClientId('');
                      setSelectedClient(null);
                      setShowClientList(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                  >
                    — без клиента —
                  </button>

                  {/* Все клиенты филиала */}
                  <div style={{ maxHeight: clients.length > 5 ? 208 : undefined, overflowY: clients.length > 5 ? 'auto' : undefined }}>
                    {clientsLoading ? (
                      <div className="px-4 py-3 text-sm text-gray-400">Загрузка...</div>
                    ) : clients.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">Нет клиентов</div>
                    ) : clients.map(c => (
                      <button
                        key={c.id}
                        onMouseDown={e => {
                          e.preventDefault();
                          setClientId(c.id);
                          setSelectedClient(c);
                          setShowClientList(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between ${clientId === c.id ? 'bg-green-50' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 truncate">{c.name || (c.phone && formatPhone(c.phone))}</p>
                          {c.name && <p className="text-xs text-gray-400">{formatPhone(c.phone)}</p>}
                        </div>
                        {clientId === c.id && <Check size={14} className="text-green-600 flex-shrink-0 ml-2" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Мини-форма нового клиента */}
              {showNewClientForm && (
                <div className="mt-2 border border-green-200 rounded-xl p-3 space-y-2" style={{ backgroundColor: 'rgba(16,185,129,0.04)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">Новый клиент</p>
                    <button
                      onMouseDown={e => {
                        e.preventDefault();
                        setShowNewClientForm(false);
                        setNewClientName('');
                        setNewClientPhone('');
                        setNameSuggestions([]);
                        setShowSuggestions(false);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Имя с автокомплитом */}
                  <div className="relative">
                    <input
                      type="text"
                      value={newClientName}
                      onChange={e => { setNewClientName(e.target.value); searchClientsByName(e.target.value); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      onFocus={() => { if (newClientName.trim() && nameSuggestions.length > 0) setShowSuggestions(true); }}
                      placeholder="Имя и фамилия"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {showSuggestions && nameSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {nameSuggestions.map(s => (
                          <button
                            key={s.id}
                            onMouseDown={e => {
                              e.preventDefault();
                              setClientId(s.id);
                              setSelectedClient(s);
                              setShowNewClientForm(false);
                              setNewClientName('');
                              setNewClientPhone('');
                              setNameSuggestions([]);
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50"
                          >
                            <p className="text-sm text-gray-900">{s.name || (s.phone && formatPhone(s.phone))}</p>
                            <p className="text-xs text-gray-400">
                              {s.name ? formatPhone(s.phone) : ''}
                              {s.name && s.branch?.name ? ' · ' : ''}
                              {s.branch?.name ?? ''}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Телефон */}
                  <input
                    type="tel"
                    value={newClientPhone}
                    onChange={e => setNewClientPhone(formatPhone(e.target.value))}
                    placeholder="Телефон *"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />

                  <button
                    onMouseDown={e => { e.preventDefault(); handleCreateClient(); }}
                    disabled={!newClientPhone.trim() || newClientSaving}
                    className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {newClientSaving ? 'Создаём...' : 'Добавить'}
                  </button>
                </div>
              )}
            </div>

            {/* Товары */}
            {items.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.product_name}</p>
                    <p className="text-xs text-gray-400">На складе: {item.stock_qty} шт</p>
                  </div>
                  <button onMouseDown={e => { e.preventDefault(); removeItem(idx); }} className="text-gray-300 hover:text-red-400">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Количество</label>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button type="button" onMouseDown={e => {
                        e.preventDefault();
                        setRawQuantity(prev => { const next = { ...prev }; delete next[item.product_id]; return next; });
                        updateItem(idx, 'quantity', item.quantity - 1);
                      }} className="px-3 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium">−</button>
                      <input type="text" inputMode="numeric"
                        value={rawQuantity[item.product_id] ?? (item.quantity === 0 ? '' : String(item.quantity))}
                        onChange={e => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setRawQuantity(prev => ({ ...prev, [item.product_id]: raw }));
                          const num = parseInt(raw);
                          if (num > 0) updateItem(idx, 'quantity', num);
                        }}
                        onFocus={e => {
                          setRawQuantity(prev => ({ ...prev, [item.product_id]: item.quantity === 0 ? '' : String(item.quantity) }));
                          const input = e.target;
                          setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                        }}
                        onBlur={() => {
                          setRawQuantity(prev => { const next = { ...prev }; delete next[item.product_id]; return next; });
                        }}
                        className="flex-1 text-center text-sm py-2 border-0 focus:outline-none min-w-0" />
                      <button type="button" onMouseDown={e => {
                        e.preventDefault();
                        setRawQuantity(prev => { const next = { ...prev }; delete next[item.product_id]; return next; });
                        updateItem(idx, 'quantity', item.quantity + 1);
                      }} className="px-3 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Цена продажи ₸</label>
                    <input type="text" inputMode="numeric"
                      value={rawPrice[item.product_id] ?? (item.price === 0 ? '' : String(item.price))}
                      onChange={e => {
                        const raw = e.target.value.replace(/[^0-9.]/g, '');
                        setRawPrice(prev => ({ ...prev, [item.product_id]: raw }));
                        const num = parseFloat(raw);
                        if (!isNaN(num) && num >= 0) updateItem(idx, 'price', num);
                      }}
                      onFocus={e => {
                        setRawPrice(prev => ({ ...prev, [item.product_id]: item.price === 0 ? '' : String(item.price) }));
                        const input = e.target;
                        setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                      }}
                      onBlur={() => {
                        setRawPrice(prev => { const next = { ...prev }; delete next[item.product_id]; return next; });
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <span className="text-sm font-semibold text-gray-700">
                    Сумма: ₸{(item.quantity * item.price).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}

            {/* Поиск товара */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Добавить товар</label>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={search}
                      onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
                      onFocus={() => setShowSearch(true)}
                      placeholder="Поиск по названию или штрихкоду..."
                      className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <button onMouseDown={e => { e.preventDefault(); setShowScanner(true); }}
                    className="px-3 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    <QrCode size={16} />
                  </button>
                </div>
                {showSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredProducts.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">Не найдено</div>
                    ) : filteredProducts.slice(0, 8).map(p => {
                      const qty = (p.stock as any)?.find((s: any) => s.branch_id === branchId)?.quantity ?? 0;
                      return (
                        <button key={p.id}
                          onTouchStart={e => { e.preventDefault(); addItem(p); }}
                          onClick={() => addItem(p)}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-900">{p.name}</p>
                            <p className="text-xs text-gray-400">₸{p.price.toLocaleString()} · остаток: {qty} шт</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${qty > 0 ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                            {qty > 0 ? 'В наличии' : 'Нет'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Примечание */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Примечание</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Необязательно..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            </div>

            {/* ── Секция мастерской ── */}
            <div className="border border-purple-100 rounded-xl overflow-hidden">
              {/* Чекбокс-заголовок */}
              <button
                type="button"
                onClick={() => setAddWorkshop(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors text-left"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${addWorkshop ? 'bg-purple-600 border-purple-600' : 'border-gray-300 bg-white'}`}>
                  {addWorkshop && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>
                <Wrench size={14} className="text-purple-600 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-800">Добавить заказ в мастерскую</span>
              </button>

              {addWorkshop && (
                <div className="px-4 py-3 space-y-3 bg-white">

                  {/* Выбор услуги */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Услуга *</label>
                    <button
                      type="button"
                      onClick={() => { setWorkshopShowServiceList(v => !v); setWorkshopShowCreateService(false); }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <span className={workshopServiceName ? 'text-gray-900' : 'text-gray-400'}>
                        {workshopServiceName || '— выберите услугу —'}
                      </span>
                      <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                    </button>

                    {workshopShowServiceList && (
                      <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                        <button
                          onMouseDown={e => { e.preventDefault(); setWorkshopServiceId(''); setWorkshopServiceName(''); setWorkshopShowServiceList(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                        >
                          — не выбрано —
                        </button>
                        {workshopServices.filter(s => s.is_active).map(svc => (
                          <button
                            key={svc.id}
                            onMouseDown={e => {
                              e.preventDefault();
                              setWorkshopServiceId(svc.id);
                              setWorkshopServiceName(svc.name);
                              if (svc.price > 0) setWorkshopServicePrice(svc.price);
                              setWorkshopShowServiceList(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between ${workshopServiceId === svc.id ? 'bg-purple-50' : ''}`}
                          >
                            <span className="text-sm text-gray-900">{svc.name}</span>
                            {svc.price > 0 && <span className="text-xs text-gray-400">₸{svc.price.toLocaleString()}</span>}
                          </button>
                        ))}
                        <button
                          onMouseDown={e => { e.preventDefault(); setWorkshopServiceId(''); setWorkshopServiceName(''); setWorkshopShowServiceList(false); setWorkshopShowCreateService(true); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-purple-600 font-medium hover:bg-purple-50 border-t border-gray-100"
                        >
                          + Создать услугу
                        </button>
                      </div>
                    )}

                    {/* Inline-форма создания новой услуги */}
                    {workshopShowCreateService && (
                      <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
                        <input
                          type="text"
                          value={newWsServiceName}
                          onChange={e => setNewWsServiceName(e.target.value)}
                          placeholder="Название услуги"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                          autoFocus
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          value={newWsServicePrice === 0 ? '' : String(newWsServicePrice)}
                          onChange={e => setNewWsServicePrice(parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                          onFocus={(e) => {
                            const input = e.target;
                            setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace' && e.currentTarget.value.length === 1) {
                              e.preventDefault();
                              setNewWsServicePrice(0);
                            }
                          }}
                          placeholder="Цена (₸)"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <div className="flex gap-2">
                          <button type="button"
                            onClick={() => { setWorkshopShowCreateService(false); setNewWsServiceName(''); setNewWsServicePrice(0); }}
                            className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-100">
                            Отмена
                          </button>
                          <button type="button"
                            disabled={creatingWsService || !newWsServiceName.trim()}
                            onClick={async () => {
                              setCreatingWsService(true);
                              const result = await createService({ name: newWsServiceName.trim(), price: newWsServicePrice, branch_id: null, is_active: true });
                              setCreatingWsService(false);
                              if (result.error) { alert('Ошибка: ' + result.error); return; }
                              const created = result.data!;
                              setWorkshopServices(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ru')));
                              setWorkshopServiceId(created.id);
                              setWorkshopServiceName(created.name);
                              if (created.price > 0) setWorkshopServicePrice(created.price);
                              setWorkshopShowCreateService(false);
                              setNewWsServiceName('');
                              setNewWsServicePrice(0);
                            }}
                            className="flex-1 py-2 rounded-lg text-sm bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50">
                            {creatingWsService ? 'Создаём...' : 'Сохранить'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Цены */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Стоимость услуги ₸</label>
                      <input type="text" inputMode="numeric"
                        value={workshopServicePrice === 0 ? '' : String(workshopServicePrice)}
                        onChange={e => setWorkshopServicePrice(parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                        onFocus={(e) => {
                          const input = e.target;
                          setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && e.currentTarget.value.length === 1) {
                            e.preventDefault();
                            setWorkshopServicePrice(0);
                          }
                        }}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Стоимость запчастей ₸</label>
                      <input type="text" inputMode="numeric"
                        value={workshopPartsPrice === 0 ? '' : String(workshopPartsPrice)}
                        onChange={e => setWorkshopPartsPrice(parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                        onFocus={(e) => {
                          const input = e.target;
                          setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && e.currentTarget.value.length === 1) {
                            e.preventDefault();
                            setWorkshopPartsPrice(0);
                          }
                        }}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>

                  {/* Итого мастерская */}
                  {(workshopServicePrice + workshopPartsPrice) > 0 && (
                    <div className="bg-purple-50 rounded-lg px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-purple-600">Итого мастерская</span>
                      <span className="text-sm font-semibold text-purple-700">
                        ₸{(workshopServicePrice + workshopPartsPrice).toLocaleString()}
                      </span>
                    </div>
                  )}

                  {/* Тип оплаты мастерской */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-2">Тип оплаты мастерской</label>
                    <div className="flex gap-1.5">
                      {([
                        { value: 'on_delivery', label: 'При получении' },
                        { value: 'prepaid',     label: 'Предоплата' },
                        { value: 'full',        label: '100% сразу' },
                      ] as { value: WorkshopPaymentType; label: string }[]).map(opt => (
                        <label key={opt.value}
                          className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-[11px] font-medium border cursor-pointer transition-colors ${
                            workshopPaymentType === opt.value
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          <input type="radio" name="wsPaymentType" value={opt.value}
                            checked={workshopPaymentType === opt.value}
                            onChange={() => setWorkshopPaymentType(opt.value)}
                            className="sr-only" />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Поле предоплаты */}
                  {workshopPaymentType === 'prepaid' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Сумма предоплаты ₸</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={workshopPrepayment === 0 ? '' : String(workshopPrepayment)}
                        onChange={e => setWorkshopPrepayment(Number(e.target.value.replace(/[^0-9]/g, '')))}
                        onFocus={(e) => {
                          const input = e.target;
                          setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && e.currentTarget.value.length === 1) {
                            e.preventDefault();
                            setWorkshopPrepayment(0);
                          }
                        }}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      {(workshopServicePrice + workshopPartsPrice) > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          Остаток: ₸{Math.max(0, workshopServicePrice + workshopPartsPrice - workshopPrepayment).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Примечание к заказу */}
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Примечание к заказу</label>
                    <textarea value={workshopNotes} onChange={e => setWorkshopNotes(e.target.value)} rows={2}
                      placeholder="Описание работ..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Итого */}
            {mode === 'sale' && (items.length > 0 || addWorkshop) && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                {/* Детализация суммы */}
                <div className="space-y-1.5">
                  {items.length > 0 && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Товары:</span>
                      <span>₸{total.toLocaleString()}</span>
                    </div>
                  )}

                  {addWorkshop && (workshopServicePrice + workshopPartsPrice) > 0 && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>
                        {'Мастерская'}
                        {workshopPaymentType === 'on_delivery' ? ' (при получении)' :
                         workshopPaymentType === 'prepaid' ? ' (предоплата)' : ''}
                        {':'}
                      </span>
                      <span>
                        {workshopPaymentType === 'on_delivery'
                          ? `+₸${(workshopServicePrice + workshopPartsPrice).toLocaleString()} позже`
                          : workshopPaymentType === 'prepaid'
                            ? `+₸${workshopPrepayment.toLocaleString()} сейчас`
                            : `+₸${(workshopServicePrice + workshopPartsPrice).toLocaleString()}`
                        }
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between font-bold text-base text-gray-900 border-t border-gray-200 pt-2">
                    <span>Итого к оплате сейчас:</span>
                    <span>₸{totalNow.toLocaleString()}</span>
                  </div>

                  {addWorkshop && workshopPaymentType === 'prepaid' &&
                   (workshopServicePrice + workshopPartsPrice - workshopPrepayment) > 0 && (
                    <div className="flex justify-between text-sm text-orange-500">
                      <span>Остаток по мастерской (при получении):</span>
                      <span>₸{(workshopServicePrice + workshopPartsPrice - workshopPrepayment).toLocaleString()}</span>
                    </div>
                  )}

                  {addWorkshop && workshopPaymentType === 'on_delivery' && (workshopServicePrice + workshopPartsPrice) > 0 && (
                    <div className="flex justify-between text-xs text-orange-500">
                      <span>Общая сумма заказа:</span>
                      <span>₸{(total + workshopServicePrice + workshopPartsPrice).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Способ оплаты */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Способ оплаты</label>
                  <div className="grid grid-cols-3 gap-1">
                    {(['cash', 'kaspi_qr', 'mixed'] as const).map(m => (
                      <button key={m} onClick={() => setPaymentMethod(m)}
                        className={`py-2 rounded-lg text-xs font-medium transition-colors ${paymentMethod === m ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                        {m === 'cash' ? '💵 Наличные' : m === 'kaspi_qr' ? '📱 Kaspi QR' : '💳 Смешанная'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Поля оплаты */}
                {paymentMethod === 'cash' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Получено наличными ₸</label>
                    <input type="text" inputMode="numeric" value={paidCash}
                      onChange={e => setPaidCash(e.target.value.replace(/[^0-9.]/g, ''))}
                      onFocus={(e) => {
                        const input = e.target;
                        setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && e.currentTarget.value.length === 1) {
                          e.preventDefault();
                          setPaidCash('');
                        }
                      }}
                      placeholder={totalNow.toString()}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    {change > 0 && (
                      <p className="text-sm text-green-600 font-medium mt-1">Сдача: ₸{change.toLocaleString()}</p>
                    )}
                  </div>
                )}

                {paymentMethod === 'mixed' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Наличные ₸</label>
                      <input type="text" inputMode="numeric" value={paidCash}
                        onChange={e => setPaidCash(e.target.value.replace(/[^0-9.]/g, ''))}
                        onFocus={(e) => {
                          const input = e.target;
                          setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && e.currentTarget.value.length === 1) {
                            e.preventDefault();
                            setPaidCash('');
                          }
                        }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Kaspi QR ₸</label>
                      <input type="text" inputMode="numeric" value={paidKaspi}
                        onChange={e => setPaidKaspi(e.target.value.replace(/[^0-9.]/g, ''))}
                        onFocus={(e) => {
                          const input = e.target;
                          setTimeout(() => input.setSelectionRange(0, input.value.length), 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && e.currentTarget.value.length === 1) {
                            e.preventDefault();
                            setPaidKaspi('');
                          }
                        }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    {change > 0 && (
                      <p className="col-span-2 text-sm text-green-600 font-medium">Сдача: ₸{change.toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Поля предзаказа */}
            {mode === 'preorder' && (
              <div className="space-y-3 pt-1">
                {/* Тип оплаты */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Тип оплаты</label>
                  <div className="flex gap-2">
                    {(['none', 'prepaid', 'full'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPreorderPaymentType(t)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors"
                        style={{
                          background: preorderPaymentType === t ? '#f59e0b' : 'transparent',
                          color: preorderPaymentType === t ? '#fff' : '#6b7280',
                          borderColor: preorderPaymentType === t ? '#f59e0b' : '#e5e7eb',
                        }}
                      >
                        {t === 'none' ? 'Без' : t === 'prepaid' ? 'Частичная' : 'Полная'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Предоплата */}
                {preorderPaymentType === 'prepaid' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Сумма предоплаты ₸</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={prepaymentAmount}
                        onChange={e => setPrepaymentAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Способ</label>
                      <div className="flex gap-1 h-[38px]">
                        {(['cash', 'kaspi'] as const).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPrepaymentMethod(m)}
                            className="flex-1 rounded-lg text-xs font-medium border transition-colors"
                            style={{
                              background: prepaymentMethod === m ? '#f59e0b' : 'transparent',
                              color: prepaymentMethod === m ? '#fff' : '#6b7280',
                              borderColor: prepaymentMethod === m ? '#f59e0b' : '#e5e7eb',
                            }}
                          >
                            {m === 'cash' ? 'Нал' : 'Kaspi'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Ожидаемая дата */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ожидаемая дата</label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={e => setExpectedDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                {/* Заметки */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Заметки</label>
                  <textarea
                    value={preorderNotes}
                    onChange={e => setPreorderNotes(e.target.value)}
                    rows={2}
                    placeholder="Дополнительная информация..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Отмена
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || (mode === 'sale' && items.length === 0 && !addWorkshop)}
              className="flex-1 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
              style={{ background: mode === 'preorder' ? '#f59e0b' : '#16a34a' }}
            >
              {loading
                ? 'Сохраняем...'
                : mode === 'preorder'
                  ? `Создать предзаказ${total > 0 ? ` (₸${total.toLocaleString()})` : ''}`
                  : `Оформить продажу (₸${totalNow.toLocaleString()})`
              }
            </button>
          </div>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}

      {showKaspiQR && tempSaleId && (
        <KaspiQRModal
          amount={total}
          saleId={tempSaleId}
          onConfirm={handleKaspiConfirm}
          onCancel={handleKaspiCancel}
        />
      )}
    </>
  );
}

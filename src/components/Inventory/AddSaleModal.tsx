import { useState, useEffect } from 'react';
import { X, Search, QrCode, Trash2, ChevronDown, Plus, Check } from 'lucide-react';
import { createSale, getProductsFromStock, getProductByBarcode } from '../../services/inventory';
import { supabase } from '../../services/supabase';
import BarcodeScanner from '../Shared/BarcodeScanner';
import KaspiQRModal from './KaspiQRModal';
import type { Product, Client } from '../../types';

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
}

type ClientSnap = Pick<Client, 'id' | 'phone'> & { name?: string; branch?: { name: string } | null };

export default function AddSaleModal({ branchId, employeeId, onClose, onSuccess }: Props) {
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

  // client UI state
  const [clientsLoading, setClientsLoading] = useState(false);
  const [showClientList, setShowClientList] = useState(false);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<ClientSnap[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [newClientSaving, setNewClientSaving] = useState(false);

  useEffect(() => {
    getProductsFromStock(branchId).then(data =>
      setProducts([...data].sort((a, b) => a.name.localeCompare(b.name, 'ru')))
    );
    fetchPaymentClients();
  }, [branchId]);

  async function fetchPaymentClients() {
    setClientsLoading(true);
    try {
      // 1. Последний этап по каждому чату
      const { data: stages } = await supabase
        .from('deal_stages')
        .select('chat_id, current_stage, moved_to_stage_at')
        .order('moved_to_stage_at', { ascending: false });

      const latestStage: Record<string, string> = {};
      (stages ?? []).forEach((s: any) => {
        if (!latestStage[s.chat_id]) latestStage[s.chat_id] = s.current_stage;
      });

      // 2. Чаты на этапе payment
      const paymentChatIds = Object.entries(latestStage)
        .filter(([, stage]) => stage === 'payment')
        .map(([chatId]) => chatId);

      if (paymentChatIds.length === 0) { setClients([]); setClientsLoading(false); return; }

      // 3. client_id из этих чатов
      const { data: chatsData } = await supabase
        .from('chats')
        .select('client_id')
        .in('id', paymentChatIds);

      const clientIds = [...new Set((chatsData ?? []).map((c: any) => c.client_id).filter(Boolean))];
      if (clientIds.length === 0) { setClients([]); setClientsLoading(false); return; }

      // 4. Сами клиенты
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, name, phone')
        .in('id', clientIds);

      setClients((clientData ?? []) as ClientSnap[]);
    } catch (e) {
      console.error('[AddSaleModal] fetchPaymentClients:', e);
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

  useEffect(() => {
    if (paymentMethod === 'cash') {
      setChange(Math.max(0, parseFloat(paidCash || '0') - total));
    } else if (paymentMethod === 'mixed') {
      const paid = parseFloat(paidCash || '0') + parseFloat(paidKaspi || '0');
      setChange(Math.max(0, paid - total));
    }
  }, [paidCash, paidKaspi, total, paymentMethod]);

  const addItem = (product: Product) => {
    const stockQty = (product.stock as any)?.[0]?.quantity ?? 0;
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
    setSearch('');
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

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (items.length === 0) return;
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
            <h2 className="text-base font-semibold text-gray-900">Новая продажа</h2>
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

                  {/* Список клиентов на этапе «Оплата» */}
                  <div style={{ maxHeight: clients.length > 5 ? 208 : undefined, overflowY: clients.length > 5 ? 'auto' : undefined }}>
                    {clientsLoading ? (
                      <div className="px-4 py-3 text-sm text-gray-400">Загрузка...</div>
                    ) : clients.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-gray-400">Нет клиентов в стадии «Оплата»</div>
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
                          <p className="text-sm text-gray-900 truncate">{c.name || c.phone}</p>
                          {c.name && <p className="text-xs text-gray-400">{c.phone}</p>}
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
                            <p className="text-sm text-gray-900">{s.name || s.phone}</p>
                            <p className="text-xs text-gray-400">
                              {s.name ? s.phone : ''}
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
                    onChange={e => setNewClientPhone(e.target.value)}
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
                      <button type="button" onMouseDown={e => { e.preventDefault(); updateItem(idx, 'quantity', item.quantity - 1); }}
                        className="px-3 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium">−</button>
                      <input type="text" inputMode="numeric"
                        value={item.quantity === 0 ? '' : String(item.quantity)}
                        onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                        onFocus={e => e.target.select()}
                        className="flex-1 text-center text-sm py-2 border-0 focus:outline-none min-w-0" />
                      <button type="button" onMouseDown={e => { e.preventDefault(); updateItem(idx, 'quantity', item.quantity + 1); }}
                        className="px-3 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 font-medium">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Цена продажи ₸</label>
                    <input type="number" value={item.price || ''}
                      onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
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
                      const qty = (p.stock as any)?.[0]?.quantity ?? 0;
                      return (
                        <button key={p.id} onMouseDown={e => { e.preventDefault(); addItem(p); }}
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

            {/* Итого */}
            {items.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-base font-bold text-gray-900">
                  <span>Итого к оплате:</span>
                  <span>₸{total.toLocaleString()}</span>
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
                    <input type="number" value={paidCash}
                      onChange={e => setPaidCash(e.target.value)}
                      placeholder={total.toString()}
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
                      <input type="number" value={paidCash}
                        onChange={e => setPaidCash(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Kaspi QR ₸</label>
                      <input type="number" value={paidKaspi}
                        onChange={e => setPaidKaspi(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    {change > 0 && (
                      <p className="col-span-2 text-sm text-green-600 font-medium">Сдача: ₸{change.toLocaleString()}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Примечание */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Примечание</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Необязательно..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Отмена
            </button>
            <button onClick={handleSubmit} disabled={loading || items.length === 0}
              className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Сохраняем...' : `Оформить продажу (₸${total.toLocaleString()})`}
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

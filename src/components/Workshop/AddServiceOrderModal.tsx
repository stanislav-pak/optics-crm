import { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { createServiceOrder, createService } from '../../services/workshop';
import { formatPhone } from '@/utils/formatters';
import type { Service } from '../../types';
import { WORKSHOP_BRANCH_ID } from '../../constants';

type PaymentType = 'prepaid' | 'full' | 'on_delivery';

interface Props {
  branchId: string;       // филиал создателя (created_branch_id)
  employeeId: string;
  services: Service[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddServiceOrderModal({ branchId, employeeId, services, onClose, onSuccess }: Props) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [partsPrice, setPartsPrice] = useState('');
  const [prepayment, setPrepayment] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('on_delivery');
  const [notes, setNotes] = useState('');
  const [estimatedReadyAt, setEstimatedReadyAt] = useState('');
  const [prepaymentMethod, setPrepaymentMethod] = useState<'cash' | 'kaspi'>('cash');
  const [loading, setLoading] = useState(false);
  const [showServiceList, setShowServiceList] = useState(false);

  const [localServices, setLocalServices] = useState<Service[]>(services);
  const [showCreateService, setShowCreateService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState(0);
  const [creatingService, setCreatingService] = useState(false);

  const total = (parseFloat(servicePrice) || 0) + (parseFloat(partsPrice) || 0);

  // Синхронизируем prepayment с типом оплаты
  useEffect(() => {
    if (paymentType === 'full') {
      setPrepayment(String(total));
    } else if (paymentType === 'on_delivery') {
      setPrepayment('0');
    }
  }, [paymentType, total]);

  // Свайп для закрытия
  useEffect(() => {
    const start = { x: 0, y: 0 };
    const onStart = (e: TouchEvent) => {
      start.x = e.touches[0].clientX;
      start.y = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = Math.abs(e.changedTouches[0].clientY - start.y);
      if (dx > 60 && dy < 80) onClose();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onClose]);

  function handleServiceSelect(svc: Service) {
    setServiceId(svc.id);
    setServiceName(svc.name);
    if (svc.price > 0) setServicePrice(String(svc.price));
    setShowServiceList(false);
  }

  function cancelCreate() {
    setShowCreateService(false);
    setNewServiceName('');
    setNewServicePrice(0);
    setServiceId('');
    setServiceName('');
  }

  async function handleCreateService() {
    const name = newServiceName.trim();
    if (!name) return;
    setCreatingService(true);
    const result = await createService({
      name,
      price: newServicePrice,
      branch_id: WORKSHOP_BRANCH_ID,
      is_active: true,
    });
    setCreatingService(false);
    if (result.error) {
      alert('Не удалось создать услугу: ' + (typeof result.error === 'string' ? result.error : JSON.stringify(result.error)));
      return;
    }
    const created = result.data!;
    const updated = [...localServices, created].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru')
    );
    setLocalServices(updated);
    setServiceId(created.id);
    setServiceName(created.name);
    if (created.price > 0) setServicePrice(String(created.price));
    setShowCreateService(false);
    setNewServiceName('');
    setNewServicePrice(0);
  }

  async function handleSubmit() {
    const finalServiceName = serviceName.trim();
    if (!clientName.trim() || !finalServiceName) return;
    setLoading(true);
    try {
      const prepaymentVal = parseFloat(prepayment) || 0;
      await createServiceOrder({
        branch_id: WORKSHOP_BRANCH_ID,
        created_branch_id: branchId,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
        employee_id: employeeId,
        service_id: serviceId || undefined,
        service_name: finalServiceName,
        service_price: parseFloat(servicePrice) || 0,
        parts_price: parseFloat(partsPrice) || 0,
        prepayment: prepaymentVal,
        payment_type: paymentType,
        notes: notes.trim() || undefined,
        estimated_ready_at: estimatedReadyAt || undefined,
        prepayment_method: prepaymentVal > 0 ? prepaymentMethod : undefined,
        prepayment_paid_at: prepaymentVal > 0 ? new Date().toISOString() : undefined,
      });
      onSuccess();
    } catch (e: unknown) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  const selectedService = localServices.find(s => s.id === serviceId);
  const canSubmit = !loading && clientName.trim().length > 0 && (serviceName.trim().length > 0 || serviceId.length > 0);
  const remaining = Math.max(0, total - (parseFloat(prepayment) || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Новый заказ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Имя клиента */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Имя клиента <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Иванов Иван"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Телефон */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Телефон клиента</label>
            <input
              type="tel"
              value={clientPhone}
              onChange={e => setClientPhone(formatPhone(e.target.value))}
              placeholder="+7 777 000 00 00"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Услуга */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Услуга <span className="text-red-400">*</span>
            </label>
            <button
              type="button"
              onClick={() => { setShowServiceList(v => !v); setShowCreateService(false); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <span className={selectedService ? 'text-gray-900' : 'text-gray-400'}>
                {selectedService ? selectedService.name : '— выберите услугу —'}
              </span>
              <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
            </button>

            {showServiceList && (
              <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                <button
                  onMouseDown={e => {
                    e.preventDefault();
                    setServiceId('');
                    setServiceName('');
                    setShowServiceList(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                >
                  — не выбрано —
                </button>

                {localServices.filter(s => s.is_active).map(svc => (
                  <button
                    key={svc.id}
                    onMouseDown={e => { e.preventDefault(); handleServiceSelect(svc); }}
                    className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between ${serviceId === svc.id ? 'bg-purple-50' : ''}`}
                  >
                    <span className="text-sm text-gray-900">{svc.name}</span>
                    {svc.price > 0 && (
                      <span className="text-xs text-gray-400">₸{svc.price.toLocaleString()}</span>
                    )}
                  </button>
                ))}

                <button
                  onMouseDown={e => {
                    e.preventDefault();
                    setServiceId('');
                    setServiceName('');
                    setShowServiceList(false);
                    setShowCreateService(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm text-purple-600 font-medium hover:bg-purple-50 border-t border-gray-100"
                >
                  + Создать услугу
                </button>
              </div>
            )}

            {showCreateService && (
              <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
                <input
                  type="text"
                  value={newServiceName}
                  onChange={e => setNewServiceName(e.target.value)}
                  placeholder="Название услуги"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={newServicePrice || ''}
                    onChange={e => setNewServicePrice(parseFloat(e.target.value) || 0)}
                    placeholder="Цена (₸)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-6 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₸</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={cancelCreate}
                    className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors">
                    Отмена
                  </button>
                  <button type="button" onClick={handleCreateService}
                    disabled={creatingService || !newServiceName.trim()}
                    className="flex-1 py-2 rounded-lg text-sm bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                    {creatingService ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Стоимость работы и запчастей */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Стоимость услуги ₸</label>
              <input
                type="number"
                value={servicePrice}
                onChange={e => setServicePrice(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Стоимость запчастей ₸</label>
              <input
                type="number"
                value={partsPrice}
                onChange={e => setPartsPrice(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Итого */}
          {total > 0 && (
            <div className="bg-gray-50 rounded-lg px-4 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">Итого</span>
              <span className="text-sm font-semibold text-gray-900">₸{total.toLocaleString()}</span>
            </div>
          )}

          {/* Тип оплаты */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Тип оплаты</label>
            <div className="flex gap-2">
              {([
                { value: 'prepaid',     label: 'Предоплата' },
                { value: 'full',        label: '100% сразу' },
                { value: 'on_delivery', label: 'При получении' },
              ] as { value: PaymentType; label: string }[]).map(opt => (
                <label key={opt.value}
                  className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                    paymentType === opt.value
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  <input
                    type="radio"
                    name="paymentType"
                    value={opt.value}
                    checked={paymentType === opt.value}
                    onChange={() => setPaymentType(opt.value)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Сумма предоплаты — только при типе "Предоплата" */}
          {paymentType === 'prepaid' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Сумма предоплаты ₸</label>
              <input
                type="number"
                value={prepayment}
                onChange={e => setPrepayment(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}

          {/* Способ предоплаты — показываем если будет предоплата */}
          {paymentType !== 'on_delivery' && total > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Способ предоплаты</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPrepaymentMethod('cash')}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    prepaymentMethod === 'cash'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  💵 Наличные
                </button>
                <button
                  type="button"
                  onClick={() => setPrepaymentMethod('kaspi')}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    prepaymentMethod === 'kaspi'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  📱 Kaspi
                </button>
              </div>
            </div>
          )}

          {/* Остаток к оплате */}
          {total > 0 && paymentType !== 'on_delivery' && (
            <div className="bg-purple-50 rounded-lg px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-purple-600">Остаток к оплате</span>
              <span className="text-sm font-semibold text-purple-700">
                ₸{remaining.toLocaleString()}
              </span>
            </div>
          )}

          {/* Дата готовности */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Дата готовности</label>
            <input
              type="datetime-local"
              value={estimatedReadyAt}
              onChange={e => setEstimatedReadyAt(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Примечание */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Примечание</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Описание работы, особые пожелания..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Отмена
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
            {loading ? 'Создаём...' : 'Создать заказ'}
          </button>
        </div>
      </div>
    </div>
  );
}

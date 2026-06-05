import { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { createServiceOrder, createService } from '../../services/workshop';
import { formatPhone } from '@/utils/formatters';
import type { Service } from '../../types';

interface Props {
  branchId: string;
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
  const [price, setPrice] = useState('');
  const [prepayment, setPrepayment] = useState('');
  const [notes, setNotes] = useState('');
  const [estimatedReadyAt, setEstimatedReadyAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServiceList, setShowServiceList] = useState(false);

  // Локальная копия списка услуг — пополняется при создании новой
  const [localServices, setLocalServices] = useState<Service[]>(services);

  // Inline-форма создания новой услуги
  const [showCreateService, setShowCreateService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState(0);
  const [creatingService, setCreatingService] = useState(false);

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
    if (svc.price > 0) setPrice(String(svc.price));
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
    try {
      const created = await createService({
        name,
        price: newServicePrice,
        branch_id: null,
        is_active: true,
      });
      const updated = [...localServices, created].sort((a, b) =>
        a.name.localeCompare(b.name, 'ru')
      );
      setLocalServices(updated);
      setServiceId(created.id);
      setServiceName(created.name);
      if (created.price > 0) setPrice(String(created.price));
      setShowCreateService(false);
      setNewServiceName('');
      setNewServicePrice(0);
    } catch (e: unknown) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreatingService(false);
    }
  }

  async function handleSubmit() {
    const finalServiceName = serviceName.trim();
    if (!clientName.trim() || !finalServiceName) return;
    setLoading(true);
    try {
      await createServiceOrder({
        branch_id: branchId,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim() || undefined,
        employee_id: employeeId,
        service_id: serviceId || undefined,
        service_name: finalServiceName,
        status: 'new',
        price: parseFloat(price) || 0,
        prepayment: parseFloat(prepayment) || 0,
        notes: notes.trim() || undefined,
        estimated_ready_at: estimatedReadyAt || undefined,
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
                {/* Сброс выбора */}
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

                {/* Список активных услуг */}
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

                {/* Создать новую услугу */}
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

            {/* Inline-форма создания новой услуги */}
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
                  <button
                    type="button"
                    onClick={cancelCreate}
                    className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateService}
                    disabled={creatingService || !newServiceName.trim()}
                    className="flex-1 py-2 rounded-lg text-sm bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  >
                    {creatingService ? 'Сохранение...' : 'Сохранить'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Цена и предоплата */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Цена ₸</label>
              <input
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Предоплата ₸</label>
              <input
                type="number"
                value={prepayment}
                onChange={e => setPrepayment(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Итого к оплате */}
          {(parseFloat(price) > 0) && (
            <div className="bg-purple-50 rounded-lg px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-purple-600">Остаток к оплате</span>
              <span className="text-sm font-semibold text-purple-700">
                ₸{Math.max(0, (parseFloat(price) || 0) - (parseFloat(prepayment) || 0)).toLocaleString()}
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
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Создаём...' : 'Создать заказ'}
          </button>
        </div>
      </div>
    </div>
  );
}

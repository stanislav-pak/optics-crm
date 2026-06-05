import { useState, useEffect } from 'react';
import { X, Pencil, Check, X as XIcon } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { createService, updateService } from '../../services/workshop';
import type { Service } from '../../types';

interface Props {
  onClose: () => void;
  onServicesUpdated: () => void;
}

interface EditState {
  name: string;
  price: string;
  duration: string;
}

export default function ServicesManager({ onClose, onServicesUpdated }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', price: '', duration: '' });
  const [savingId, setSavingId] = useState<string | null>(null);

  // Форма добавления
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

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
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [onClose]);

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    setLoading(true);
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name');
    if (!error && data) setServices(data as Service[]);
    setLoading(false);
  }

  function startEdit(svc: Service) {
    setEditingId(svc.id);
    setEditState({
      name: svc.name,
      price: String(svc.price),
      duration: svc.duration_minutes != null ? String(svc.duration_minutes) : '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const name = editState.name.trim();
    const price = parseFloat(editState.price);
    if (!name || isNaN(price) || price < 0) return;
    const duration = editState.duration !== '' ? parseInt(editState.duration, 10) : undefined;
    setSavingId(id);
    const { error } = await updateService(id, {
      name,
      price,
      duration_minutes: duration ?? null as any,
    });
    setSavingId(null);
    if (!error) {
      setEditingId(null);
      await loadServices();
      onServicesUpdated();
    }
  }

  async function toggleActive(svc: Service) {
    setSavingId(svc.id);
    await updateService(svc.id, { is_active: !svc.is_active });
    setSavingId(null);
    await loadServices();
    onServicesUpdated();
  }

  async function handleAdd() {
    setAddError('');
    const name = newName.trim();
    const price = parseFloat(newPrice);
    if (!name) { setAddError('Введите название'); return; }
    if (isNaN(price) || price < 0) { setAddError('Введите корректную цену'); return; }
    const duration = newDuration !== '' ? parseInt(newDuration, 10) : undefined;
    setAdding(true);
    try {
      await createService({
        name,
        price,
        duration_minutes: duration,
        is_active: true,
        branch_id: null,
      });
      setNewName('');
      setNewPrice('');
      setNewDuration('');
      await loadServices();
      onServicesUpdated();
    } catch (e: any) {
      setAddError(e?.message ?? 'Ошибка при добавлении');
    }
    setAdding(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">

        {/* Шапка */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Управление услугами</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <X size={16} className="text-gray-600" />
          </button>
        </div>

        {/* Список услуг — скролл */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : services.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">Услуги не найдены</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {services.map(svc => (
                <div key={svc.id} className="px-5 py-3">
                  {editingId === svc.id ? (
                    /* ---- Inline-редактирование ---- */
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editState.name}
                        onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                        placeholder="Название"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <input
                            type="number"
                            min="0"
                            value={editState.price}
                            onChange={e => setEditState(s => ({ ...s, price: e.target.value }))}
                            placeholder="Цена"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₸</span>
                        </div>
                        <div className="flex-1 relative">
                          <input
                            type="number"
                            min="0"
                            value={editState.duration}
                            onChange={e => setEditState(s => ({ ...s, duration: e.target.value }))}
                            placeholder="Время (мин)"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={cancelEdit}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50"
                        >
                          <XIcon size={12} />
                          Отмена
                        </button>
                        <button
                          onClick={() => saveEdit(svc.id)}
                          disabled={savingId === svc.id}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                          <Check size={12} />
                          {savingId === svc.id ? 'Сохранение...' : 'Сохранить'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ---- Строка просмотра ---- */
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${svc.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
                          {svc.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {svc.price.toLocaleString()} ₸
                          {svc.duration_minutes != null && (
                            <span className="ml-1.5 text-gray-400">· {svc.duration_minutes} мин</span>
                          )}
                        </p>
                      </div>

                      {/* Тоггл активности */}
                      <button
                        onClick={() => toggleActive(svc)}
                        disabled={savingId === svc.id}
                        title={svc.is_active ? 'Деактивировать' : 'Активировать'}
                        className={`relative inline-flex w-9 h-5 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                          svc.is_active ? 'bg-purple-500' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block w-4 h-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200 ${
                            svc.is_active ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>

                      {/* Кнопка редактирования */}
                      <button
                        onClick={() => startEdit(svc)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 flex-shrink-0"
                        title="Изменить"
                      >
                        <Pencil size={12} />
                        Изменить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Форма добавления — фиксирована внизу */}
        <div className="border-t border-gray-100 px-5 py-4 flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Добавить услугу</p>
          <div className="space-y-2">
            <input
              type="text"
              value={newName}
              onChange={e => { setNewName(e.target.value); setAddError(''); }}
              placeholder="Название услуги"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            />
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="number"
                  min="0"
                  value={newPrice}
                  onChange={e => { setNewPrice(e.target.value); setAddError(''); }}
                  placeholder="Цена"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">₸</span>
              </div>
              <input
                type="number"
                min="0"
                value={newDuration}
                onChange={e => setNewDuration(e.target.value)}
                placeholder="Время (мин)"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
              />
            </div>
            {addError && (
              <p className="text-xs text-red-500">{addError}</p>
            )}
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newPrice}
              className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {adding ? 'Добавление...' : '+ Добавить'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

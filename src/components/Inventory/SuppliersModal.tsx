import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react';
import { supabase } from '../../services/supabase';
import type { Supplier } from '../../types';

interface Props {
  onClose: () => void;
}

export default function SuppliersModal({ onClose }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    loadSuppliers();
  }, []);

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

  const loadSuppliers = async () => {
    setLoading(true);
    const { data } = await supabase.from('suppliers').select('*').order('name');
    setSuppliers(data ?? []);
    setLoading(false);
  };

  const addSupplier = async () => {
    if (!newName.trim()) return;
    await supabase.from('suppliers').insert({
      name: newName.trim(),
      phone: newPhone.trim() || null,
      email: newEmail.trim() || null,
    });
    setNewName(''); setNewPhone(''); setNewEmail('');
    setShowAdd(false);
    loadSuppliers();
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    await supabase.from('suppliers').update({
      name: editName.trim(),
      phone: editPhone.trim() || null,
      email: editEmail.trim() || null,
    }).eq('id', id);
    setEditingId(null);
    loadSuppliers();
  };

  const deleteSupplier = async (id: string) => {
    if (!confirm('Удалить поставщика?')) return;
    await supabase.from('suppliers').delete().eq('id', id);
    loadSuppliers();
  };

  const startEdit = (s: Supplier) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPhone(s.phone ?? '');
    setEditEmail(s.email ?? '');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" data-modal="true">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Поставщики</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700">
              <Plus size={14} />
              Добавить
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {/* Форма добавления */}
          {showAdd && (
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-blue-700 mb-2">Новый поставщик</p>
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Название *"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={newPhone} onChange={e => setNewPhone(e.target.value)}
                placeholder="Телефон"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="Email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowAdd(false); setNewName(''); setNewPhone(''); setNewEmail(''); }}
                  className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  Отмена
                </button>
                <button onClick={addSupplier} disabled={!newName.trim()}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  Сохранить
                </button>
              </div>
            </div>
          )}

          {/* Список */}
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Загрузка...</div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">Поставщиков нет — добавьте первого</div>
          ) : suppliers.map(s => (
            <div key={s.id} className="border border-gray-200 rounded-xl p-3">
              {editingId === s.id ? (
                <div className="space-y-2">
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                    placeholder="Телефон"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input value={editEmail} onChange={e => setEditEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600">
                      Отмена
                    </button>
                    <button onClick={() => saveEdit(s.id)}
                      className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">
                      <Check size={12} className="inline mr-1" />
                      Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s.name}</p>
                    {s.phone && <p className="text-xs text-gray-400 mt-0.5">{s.phone}</p>}
                    {s.email && <p className="text-xs text-gray-400">{s.email}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(s)}
                      className="p-1.5 text-gray-300 hover:text-blue-500">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteSupplier(s.id)}
                      className="p-1.5 text-gray-300 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="w-full py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

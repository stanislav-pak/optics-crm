import { useState, useEffect } from 'react';
import { Tag, Pencil, Trash2, Check, X } from 'lucide-react';
import {
  getPricePolicies,
  createPricePolicy,
  updatePricePolicy,
  deletePricePolicy,
  getProductsByPolicy,
} from '../../services/pricePolicies';
import type { PricePolicy } from '../../services/pricePolicies';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#a78bfa', '#ef4444', '#8696a0'];

export function PricePoliciesSettings() {
  const [policies, setPolicies] = useState<PricePolicy[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    getPricePolicies()
      .then(setPolicies)
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const p = await createPricePolicy(newName.trim(), newColor);
      if (p) setPolicies(prev => [...prev, p]);
      setNewName('');
      setNewColor(COLORS[0]);
      setShowAdd(false);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: PricePolicy) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditColor(p.color);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await updatePricePolicy(editingId, editName.trim(), editColor);
    setPolicies(prev => prev.map(p => p.id === editingId ? { ...p, name: editName.trim(), color: editColor } : p));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const count = await getProductsByPolicy(id);
    if (count > 0) {
      alert(`Нельзя удалить: политика используется в ${count} товарах`);
      return;
    }
    if (!confirm('Удалить ценовую политику?')) return;
    await deletePricePolicy(id);
    setPolicies(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
          <Tag size={18} className="text-purple-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#e9edef]">Ценовые политики</h2>
          <p className="text-xs text-[#8696a0]">Метки для групп товаров</p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-[#202c33] rounded-xl overflow-hidden divide-y divide-white/5">
          {policies.length === 0 && !showAdd && (
            <p className="text-xs text-[#8696a0] text-center py-4">Политик нет</p>
          )}
          {policies.map(p =>
            editingId === p.id ? (
              <div key={p.id} className="px-4 py-3 space-y-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); setEditColor(c); }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${editColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button onMouseDown={e => { e.preventDefault(); handleSaveEdit(); }} className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
                      <Check size={13} />
                    </button>
                    <button onMouseDown={e => { e.preventDefault(); setEditingId(null); }} className="p-1.5 rounded-lg bg-white/10 text-[#8696a0] hover:bg-white/15">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 text-sm text-[#e9edef]">{p.name}</span>
                <button onClick={() => startEdit(p)} className="p-1.5 text-[#8696a0] hover:text-[#e9edef] rounded-lg hover:bg-white/5" title="Редактировать">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(p.id)} className="p-1.5 text-[#8696a0] hover:text-red-400 rounded-lg hover:bg-white/5" title="Удалить">
                  <Trash2 size={13} />
                </button>
              </div>
            )
          )}

          {showAdd && (
            <div className="px-4 py-3 space-y-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setShowAdd(false); setNewName(''); } }}
                placeholder="Название политики"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setNewColor(c); }}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${newColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  <button
                    onMouseDown={e => { e.preventDefault(); handleAdd(); }}
                    disabled={saving || !newName.trim()}
                    className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onMouseDown={e => { e.preventDefault(); setShowAdd(false); setNewName(''); }}
                    className="p-1.5 rounded-lg bg-white/10 text-[#8696a0] hover:bg-white/15"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!showAdd && (
        <button
          onClick={() => { setShowAdd(true); setEditingId(null); }}
          className="w-full py-2.5 rounded-xl border border-dashed border-white/15 text-sm text-[#8696a0] hover:border-purple-500/50 hover:text-purple-300 transition-colors"
        >
          + Добавить политику
        </button>
      )}
    </div>
  );
}

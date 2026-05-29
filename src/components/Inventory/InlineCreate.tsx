import { useState } from 'react';
import { Check, X } from 'lucide-react';

interface Props {
  placeholder: string;
  onConfirm: (name: string) => Promise<void>;
  onCancel: () => void;
}

export default function InlineCreate({ placeholder, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!value.trim() || saving) return;
    setSaving(true);
    try { await onConfirm(value.trim()); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex gap-1.5 mt-1.5">
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        className="flex-1 border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
      />
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={confirm}
        disabled={!value.trim() || saving}
        className="px-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {saving ? <span className="text-xs">...</span> : <Check size={14} />}
      </button>
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={onCancel}
        className="px-2.5 border border-gray-200 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

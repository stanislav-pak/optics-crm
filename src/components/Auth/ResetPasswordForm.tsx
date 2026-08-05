import { useState } from 'react';
import { supabase } from '../../services/supabase';
import { PasswordInput } from './PasswordInput';

interface ResetPasswordFormProps {
  onDone: () => void;
}

export function ResetPasswordForm({ onDone }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      await supabase.auth.signOut();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b141a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4"><img src="/apple-touch-icon-v2.png" alt="New Line CRM" className="w-full h-full object-cover" /></div>
          <h1 className="text-xl font-semibold text-[#e9edef]">Новый пароль</h1>
          <p className="text-sm text-[#8696a0] mt-1">Придумайте новый пароль для входа</p>
        </div>
        <div className="bg-[#202c33] rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Новый пароль</label>
            <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Повторите пароль</label>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !password || !confirmPassword}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-2"
          >
            {loading ? 'Сохраняем...' : 'Сохранить пароль'}
          </button>
        </div>
      </div>
    </div>
  );
}

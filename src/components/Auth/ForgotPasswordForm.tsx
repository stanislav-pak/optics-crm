import { useState } from 'react';
import { supabase } from '../../services/supabase';

interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (resetError) throw new Error(resetError.message);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить письмо');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#e9edef] mb-2">Письмо отправлено</h2>
          <p className="text-sm text-[#8696a0] mb-6">
            Проверьте почту {email} и перейдите по ссылке, чтобы задать новый пароль.
          </p>
          <button
            onClick={onBack}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            Назад ко входу
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b141a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4"><img src="/apple-touch-icon-v2.png" alt="New Line CRM" className="w-full h-full object-cover" /></div>
          <h1 className="text-xl font-semibold text-[#e9edef]">Восстановление пароля</h1>
          <p className="text-sm text-[#8696a0] mt-1">Укажите email, привязанный к аккаунту</p>
        </div>
        <div className="bg-[#202c33] rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@optics.kz"
              className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !email}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-2"
          >
            {loading ? 'Отправляем...' : 'Отправить ссылку'}
          </button>
          <button
            onClick={onBack}
            className="w-full text-[#8696a0] hover:text-[#d1d7db] text-sm transition-colors text-center"
          >
            Назад ко входу
          </button>
        </div>
      </div>
    </div>
  );
}

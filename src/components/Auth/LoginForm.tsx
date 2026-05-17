import { useState } from 'react';
import { signIn } from '../../services/auth';
import { SignupForm } from './SignupForm';

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignup, setShowSignup] = useState(false);

  if (showSignup) {
    return <SignupForm onBack={() => setShowSignup(false)} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b141a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4"><img src="/apple-touch-icon-v2.png" alt="New Line CRM" className="w-full h-full object-cover" /></div>
          <h1 className="text-xl font-semibold text-[#e9edef]">New Line CRM</h1>
          <p className="text-sm text-[#8696a0] mt-1">Войдите в свой аккаунт</p>
        </div>
        <div className="bg-[#202c33] rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@optics.kz" className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all" />
          </div>
          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Пароль</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all" />
          </div>
          <button onClick={handleSubmit} disabled={loading || !email || !password} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-2">
            {loading ? 'Входим...' : 'Войти'}
          </button>
          <button onClick={() => setShowSignup(true)} className="w-full text-[#8696a0] hover:text-[#d1d7db] text-sm transition-colors text-center">
            Нет аккаунта? Зарегистрироваться
          </button>
        </div>
      </div>
    </div>
  );
}


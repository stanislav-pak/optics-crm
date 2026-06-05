import { useState } from 'react';
import { supabase } from '../../services/supabase';

interface SignupFormProps {
  onBack: () => void;
}

interface Branch {
  id: string;
  name: string;
}

const ADMIN_CODE = import.meta.env.VITE_ADMIN_CODE;

// Захардкоженный список филиалов (Склад UUID a215f402-… исключён, порядок фиксирован)
const BRANCHES: Branch[] = [
  { id: 'ff42784a-5de9-458e-baf6-1ca3c8d0b79f', name: 'Жандосова' },
  { id: '1b9d7882-be86-4559-832b-14817dfcaaa3', name: 'Гум' },
  { id: '67138bd7-d688-47cf-a9c9-51cf800712ad', name: 'Абая 34' },
  { id: '1104bc27-07bb-4930-93b2-19a2d92b71c9', name: 'Мастерская' },
  { id: '30c0cd70-5f43-4201-9f6e-4d67d9aafc2f', name: 'Kaspi' },
];

export function SignupForm({ onBack }: SignupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [branchId, setBranchId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isAdmin = adminCode === ADMIN_CODE;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isAdmin && !branchId) {
      setError('Выберите филиал');
      return;
    }

    setLoading(true);
    try {
      // Для админа берём ветку "Склад", для менеджера — выбранную
      let finalBranchId = branchId;
      if (isAdmin) {
        const { data: skladBranch } = await supabase
          .from('branches')
          .select('id')
          .eq('name', 'Склад')
          .single();
        if (!skladBranch) throw new Error('Ошибка: филиал не найден');
        finalBranchId = skladBranch.id;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
          if (loginError) throw new Error('Неверный пароль для существующего аккаунта');
          if (!loginData.user) throw new Error('Ошибка входа');
          await supabase.from('employees').insert({
            user_id: loginData.user.id,
            branch_id: finalBranchId,
            name,
            email,
            role: isAdmin ? 'admin' : 'manager',
            is_active: isAdmin,
          });
          await supabase.auth.signOut();
          setSuccess(true);
          return;
        }
        throw new Error(signUpError.message);
      }

      if (!data.user) throw new Error('Ошибка создания пользователя');

      // Проверяем нет ли уже employee с этим user_id
      const { data: existing } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', data.user.id)
        .single();

      if (existing) {
        setError('Аккаунт с этим email уже зарегистрирован. Войдите в систему.');
        await supabase.auth.signOut();
        return;
      }

      const { error: empError } = await supabase.from('employees').insert({
        user_id: data.user.id,
        branch_id: finalBranchId,
        name,
        email,
        role: isAdmin ? 'admin' : 'manager',
        is_active: isAdmin,
      });
      if (empError) throw new Error(empError.message);
      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#e9edef] mb-2">
            {isAdmin ? 'Добро пожаловать!' : 'Заявка отправлена'}
          </h2>
          <p className="text-sm text-[#8696a0] mb-6">
            {isAdmin
              ? 'Аккаунт администратора создан. Войдите в систему.'
              : 'Ваша заявка отправлена на подтверждение руководителю.'}
          </p>
          <button
            onClick={onBack}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            Войти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b141a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.07-1.35C8.45 21.52 10.18 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.21-.47-4.53-1.28l-.32-.19-3.01.8.81-2.95-.21-.34C3.47 15.2 3 13.66 3 12c0-4.96 4.04-9 9-9s9 4.04 9 9-4.04 9-9 9z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-[#e9edef]">New Line CRM</h1>
          <p className="text-sm text-[#8696a0] mt-1">Создать аккаунт</p>
        </div>

        <div className="bg-[#202c33] rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
              className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ivan@optics.kz"
              className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          {/* Филиал — только для менеджеров */}
          {!isAdmin && (
            <div>
              <label className="block text-xs text-[#8696a0] mb-1.5">Филиал</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full bg-[#2a3942] text-[#d1d7db] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all appearance-none"
              >
                <option value="" disabled className="text-[#8696a0]">Выберите филиал</option>
                {BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">
              Код руководителя <span className="text-[#8696a0]">(необязательно)</span>
            </label>
            <input
              type="password"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="Только для руководителей"
              className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !name || !email || !password || (!isAdmin && !branchId)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-2"
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>

          <button
            onClick={onBack}
            className="w-full text-[#8696a0] hover:text-[#d1d7db] text-sm transition-colors text-center"
          >
            Уже есть аккаунт? Войти
          </button>
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { PasswordInput } from './PasswordInput';

interface SignupFormProps {
  onBack: () => void;
}

interface Branch {
  id: string;
  name: string;
}

export function SignupForm({ onBack }: SignupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [registeredAsAdmin, setRegisteredAsAdmin] = useState(false);

  useEffect(() => {
    supabase.from('branches').select('id, name').order('name').then(({ data }) => {
      if (data) setBranches(data);
    });
  }, []);

  // Роль (admin/manager) решает сервер (RPC register_employee) по коду
  // руководителя — клиент этого заранее не знает, поэтому филиал выбирается
  // всегда (для админа сервер всё равно переопределит его на "Склад").
  const registerEmployee = async () => {
    const { data, error: rpcError } = await supabase.rpc('register_employee', {
      p_branch_id: branchId,
      p_name: name,
      p_email: email,
      p_admin_code: adminCode || null,
    });
    if (rpcError) {
      if (rpcError.message.includes('employee_already_exists')) {
        throw new Error('Аккаунт с этим email уже зарегистрирован. Войдите в систему.');
      }
      if (rpcError.message.includes('branch_required')) {
        throw new Error('Выберите филиал');
      }
      throw new Error(rpcError.message);
    }
    const result = Array.isArray(data) ? data[0] : data;
    setRegisteredAsAdmin(result?.role === 'admin');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!branchId) {
      setError('Выберите филиал');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
          if (loginError) throw new Error('Неверный пароль для существующего аккаунта');
          if (!loginData.user) throw new Error('Ошибка входа');
          await registerEmployee();
          await supabase.auth.signOut();
          setSuccess(true);
          return;
        }
        throw new Error(signUpError.message);
      }

      if (!data.user) throw new Error('Ошибка создания пользователя');

      await registerEmployee();
      await supabase.auth.signOut();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
      await supabase.auth.signOut();
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
            {registeredAsAdmin ? 'Добро пожаловать!' : 'Заявка отправлена'}
          </h2>
          <p className="text-sm text-[#8696a0] mb-6">
            {registeredAsAdmin
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
            <PasswordInput value={password} onChange={setPassword} placeholder="••••••••" />
          </div>

          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">Филиал</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full bg-[#2a3942] text-[#d1d7db] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all appearance-none"
            >
              <option value="" disabled className="text-[#8696a0]">Выберите филиал</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#8696a0] mb-1.5">
              Код руководителя <span className="text-[#8696a0]">(необязательно)</span>
            </label>
            <PasswordInput
              value={adminCode}
              onChange={setAdminCode}
              placeholder="Только для руководителей"
              ariaSubject="код"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !name || !email || !password || !branchId}
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
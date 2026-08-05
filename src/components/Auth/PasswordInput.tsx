import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Слово в aria-label кнопки ("Показать/Скрыть <ariaSubject>") — по
  // умолчанию «пароль», но поле может быть, например, секретным кодом.
  ariaSubject?: string;
}

export function PasswordInput({ value, onChange, placeholder, ariaSubject = 'пароль' }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg pl-3 pr-10 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#d1d7db]"
        tabIndex={-1}
        aria-label={visible ? `Скрыть ${ariaSubject}` : `Показать ${ariaSubject}`}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

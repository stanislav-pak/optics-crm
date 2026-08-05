import { useState, useEffect } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  step?: string;
}

/**
 * Числовое поле со знаком (Оптическая сила, Цилиндр).
 * На мобильной цифровой клавиатуре нет кнопки "+", поэтому знак
 * задаётся отдельным тумблером +/−, а само поле хранит только модуль числа.
 */
export default function SignedNumberField({ label, value, onChange, placeholder, step = '0.25' }: Props) {
  const [negative, setNegative] = useState(() => value.trim().startsWith('-'));
  const [magnitude, setMagnitude] = useState(() => value.replace('-', ''));

  useEffect(() => {
    setNegative(value.trim().startsWith('-'));
    setMagnitude(value.replace('-', ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = (neg: boolean, mag: string) => {
    onChange(mag === '' ? '' : neg ? `-${mag}` : mag);
  };

  const handleSign = (neg: boolean) => {
    setNegative(neg);
    emit(neg, magnitude);
  };

  const handleMagnitude = (raw: string) => {
    const trimmed = raw.trim();
    const neg = trimmed.startsWith('-') ? true : trimmed.startsWith('+') ? false : negative;
    const clean = raw.replace(/^[+-]/, '');
    setNegative(neg);
    setMagnitude(clean);
    emit(neg, clean);
  };

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex gap-1.5">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
          <button
            type="button"
            onClick={() => handleSign(false)}
            className={`w-7 py-2 text-xs font-semibold flex items-center justify-center ${!negative ? 'bg-blue-600 text-white' : 'bg-white text-gray-400'}`}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => handleSign(true)}
            className={`w-7 py-2 text-xs font-semibold flex items-center justify-center border-l border-gray-200 ${negative ? 'bg-blue-600 text-white' : 'bg-white text-gray-400'}`}
          >
            −
          </button>
        </div>
        <input
          type="number"
          step={step}
          min="0"
          value={magnitude}
          onChange={e => handleMagnitude(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

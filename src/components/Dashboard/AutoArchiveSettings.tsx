import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabase';
import { Archive, Clock, MessageSquareOff, Play, CheckCircle, AlertCircle, Info, ShieldAlert, Save } from 'lucide-react';

const LS_KEY_CLOSED   = 'autoArchive_closedDeals';
const LS_KEY_INACTIVE = 'autoArchive_inactiveChats';

interface ArchiveResult {
  archived_closed:   number;
  archived_inactive: number;
  archived_total:    number;
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
        ${checked ? 'bg-emerald-500' : 'bg-white/10'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

interface AutoArchiveSettingsProps {
  onBack?: () => void;
}

export function AutoArchiveSettings({ onBack }: AutoArchiveSettingsProps) {
  const [archiveClosed,   setArchiveClosed]   = useState<boolean>(() =>
    localStorage.getItem(LS_KEY_CLOSED) !== 'false'   // дефолт true
  );
  const [archiveInactive, setArchiveInactive] = useState<boolean>(() =>
    localStorage.getItem(LS_KEY_INACTIVE) !== 'false' // дефолт true
  );

  const [running,  setRunning]  = useState(false);
  const [result,   setResult]   = useState<ArchiveResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Порог скидки для алерта «На заметке»
  const [discountThreshold, setDiscountThreshold] = useState<string>('10');
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdSaved, setThresholdSaved]   = useState(false);
  const [thresholdError, setThresholdError]   = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'watchlist_discount_threshold')
      .single()
      .then(({ data }) => {
        if (data?.value) setDiscountThreshold(data.value);
      });
  }, []);

  const handleSaveThreshold = async () => {
    const num = parseFloat(discountThreshold);
    if (isNaN(num) || num < 1 || num > 99) {
      setThresholdError('Введите число от 1 до 99');
      return;
    }
    setThresholdSaving(true);
    setThresholdError(null);
    setThresholdSaved(false);
    const { error } = await supabase
      .from('app_settings')
      .update({ value: String(num), updated_at: new Date().toISOString() })
      .eq('key', 'watchlist_discount_threshold');
    setThresholdSaving(false);
    if (error) {
      setThresholdError(error.message);
    } else {
      setThresholdSaved(true);
      setTimeout(() => setThresholdSaved(false), 3000);
    }
  };

  // Сохраняем в localStorage при каждом изменении
  useEffect(() => {
    localStorage.setItem(LS_KEY_CLOSED, String(archiveClosed));
  }, [archiveClosed]);

  useEffect(() => {
    localStorage.setItem(LS_KEY_INACTIVE, String(archiveInactive));
  }, [archiveInactive]);

  const handleRunNow = async () => {
    if (!archiveClosed && !archiveInactive) return;
    setRunning(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase.functions.invoke('auto-archive', {
        body: { archiveClosed, archiveInactive },
      });

      if (error) throw error;
      setResult(data.result as ArchiveResult);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Неизвестная ошибка');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b141a]">
      {/* Заголовок */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <Archive size={18} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#e9edef]">Автоархив чатов</h2>
            <p className="text-xs text-[#8696a0]">Автоматическое архивирование по условиям</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">

        {/* Инфо-блок о pg_cron */}
        <div className="flex gap-3 bg-white/[0.04] rounded-xl px-4 py-3">
          <Info size={15} className="text-[#8696a0] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#8696a0] leading-relaxed">
            Автоархивирование запускается на сервере <span className="text-[#d1d7db]">каждый час</span>{' '}
            через pg_cron независимо от этих настроек.
            Тогглы ниже управляют только кнопкой «Архивировать сейчас».
          </p>
        </div>

        {/* Карточка 1: закрытые сделки */}
        <div className="bg-[#202c33] rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Clock size={15} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e9edef]">
                  Закрытые сделки — 24 ч
                </p>
                <p className="text-xs text-[#8696a0] mt-0.5 leading-relaxed">
                  Когда сделка переходит в «Закрыт», чат архивируется через 24 часа.
                  Триггер ставит метку <code className="text-[#aebac1] bg-white/5 px-1 rounded">archive_after</code> в базе.
                </p>
              </div>
            </div>
            <Toggle checked={archiveClosed} onChange={setArchiveClosed} />
          </div>
        </div>

        {/* Карточка 2: неактивные чаты */}
        <div className="bg-[#202c33] rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MessageSquareOff size={15} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e9edef]">
                  Неактивные чаты — 30 дней
                </p>
                <p className="text-xs text-[#8696a0] mt-0.5 leading-relaxed">
                  Чаты без сообщений более 30 дней переводятся в архив.
                  Затрагивает только чаты со статусом <code className="text-[#aebac1] bg-white/5 px-1 rounded">active</code>.
                </p>
              </div>
            </div>
            <Toggle checked={archiveInactive} onChange={setArchiveInactive} />
          </div>
        </div>

        {/* ── Порог скидки ── */}
        <div className="bg-[#202c33] rounded-xl overflow-hidden">
          <div className="px-4 py-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShieldAlert size={15} className="text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#e9edef]">Порог скидки для алерта</p>
              <p className="text-xs text-[#8696a0] mt-0.5 leading-relaxed">
                При скидке равной или выше указанного значения — в разделе «Контроль»
                появится автоматический алерт.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={discountThreshold}
                  onChange={e => {
                    setDiscountThreshold(e.target.value.replace(/[^0-9.]/g, ''));
                    setThresholdSaved(false);
                    setThresholdError(null);
                  }}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#e9edef] text-center focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <span className="text-sm text-[#8696a0]">%</span>
                <button
                  onClick={handleSaveThreshold}
                  disabled={thresholdSaving || thresholdSaved}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-white text-sm rounded-lg transition-colors disabled:opacity-70 ${thresholdSaved ? 'bg-emerald-600' : 'bg-orange-600 hover:bg-orange-500'}`}
                >
                  {thresholdSaving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : thresholdSaved ? (
                    <CheckCircle size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  {thresholdSaved ? 'Сохранено' : 'Сохранить'}
                </button>
              </div>
              {thresholdError && (
                <p className="text-xs text-red-400 mt-1.5">{thresholdError}</p>
              )}
            </div>
          </div>
        </div>

        {/* Разделитель */}
        <div className="border-t border-white/5" />

        {/* Кнопка ручного запуска */}
        <div className="space-y-3">
          <button
            onClick={handleRunNow}
            disabled={running || (!archiveClosed && !archiveInactive)}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all
              ${running || (!archiveClosed && !archiveInactive)
                ? 'bg-white/5 text-[#8696a0] cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-[0.98]'
              }`}
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Архивируем...
              </>
            ) : (
              <>
                <Play size={15} />
                Архивировать сейчас
              </>
            )}
          </button>

          {!archiveClosed && !archiveInactive && (
            <p className="text-center text-xs text-[#8696a0]">
              Включите хотя бы одно условие
            </p>
          )}
        </div>

        {/* Результат */}
        {result && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={15} className="text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">Готово</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatTile
                label="Всего"
                value={result.archived_total}
                color="text-emerald-300"
              />
              <StatTile
                label="Сделки"
                value={result.archived_closed}
                color="text-amber-300"
              />
              <StatTile
                label="Неактивные"
                value={result.archived_inactive}
                color="text-blue-300"
              />
            </div>
            {result.archived_total === 0 && (
              <p className="text-xs text-[#8696a0] text-center pt-1">
                Подходящих чатов не найдено
              </p>
            )}
          </div>
        )}

        {/* Ошибка */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
            <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Ошибка</p>
              <p className="text-xs text-red-400 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Техническая справка */}
        <div className="bg-white/[0.03] rounded-xl px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-[#8696a0] uppercase tracking-wide">Как это работает</p>
          <ul className="space-y-2 text-xs text-[#8696a0] leading-relaxed">
            <li className="flex gap-2">
              <span className="text-[#aebac1] flex-shrink-0">1.</span>
              <span>При переходе сделки в «Закрыт» — триггер ставит метку архивации через 24 часа</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#aebac1] flex-shrink-0">2.</span>
              <span>Каждый час сервер автоматически архивирует чаты с истёкшей меткой и чаты без активности 30+ дней</span>
            </li>
            <li className="flex gap-2">
              <span className="text-[#aebac1] flex-shrink-0">3.</span>
              <span>Кнопка «Архивировать сейчас» запускает тот же процесс вручную немедленно</span>
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white/5 rounded-lg px-3 py-2 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-[#8696a0] mt-0.5">{label}</p>
    </div>
  );
}

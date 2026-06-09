import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, AlertTriangle, CheckCircle, Clock, Minus } from 'lucide-react';
import type { Branch } from '../../types';
import { getAdminBranches, getAdminCashData, getAdminStockValue, type AdminCashData } from '../../services/cashAdmin';

type PeriodTab = 'today' | 'week' | 'month' | 'custom';

function fmt(n: number) {
  return new Intl.NumberFormat('ru-KZ', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0,
  }).format(n);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getDateRange(
  period: PeriodTab,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const today = todayStr();
  if (period === 'today') {
    return { start: today + 'T00:00:00', end: today + 'T23:59:59' };
  }
  if (period === 'week') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const from = d.toISOString().split('T')[0];
    return { start: from + 'T00:00:00', end: today + 'T23:59:59' };
  }
  if (period === 'month') {
    const d = new Date();
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return { start: from + 'T00:00:00', end: today + 'T23:59:59' };
  }
  // custom
  const s = customStart || today;
  const e = customEnd || today;
  return { start: s + 'T00:00:00', end: e + 'T23:59:59' };
}

interface BranchRow {
  branch: Branch;
  data: AdminCashData | null;
  loading: boolean;
}

// ─── Табы периода ─────────────────────────────────────────────────────────

interface PeriodTabsProps {
  period: PeriodTab;
  onChange: (p: PeriodTab) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
}

function PeriodTabs({ period, onChange, customStart, customEnd, onCustomStart, onCustomEnd }: PeriodTabsProps) {
  const tabs: { key: PeriodTab; label: string }[] = [
    { key: 'today', label: 'Сегодня' },
    { key: 'week', label: 'Неделя' },
    { key: 'month', label: 'Месяц' },
    { key: 'custom', label: 'Период' },
  ];
  return (
    <div className="px-4 pb-3 space-y-2">
      <div className="flex gap-1.5">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              period === t.key ? 'bg-emerald-500 text-white' : 'bg-[#2a3942] text-[#8696a0]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex gap-2 items-center">
          <input
            type="date"
            value={customStart}
            onChange={e => onCustomStart(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <span className="text-gray-400 text-xs">—</span>
          <input
            type="date"
            value={customEnd}
            onChange={e => onCustomEnd(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}
    </div>
  );
}

// ─── Экран 1: список филиалов ──────────────────────────────────────────────

interface ListScreenProps {
  onSelect: (branch: Branch) => void;
  onBack?: () => void;
}

function ListScreen({ onSelect, onBack }: ListScreenProps) {
  const [period, setPeriod] = useState<PeriodTab>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const loadAll = useCallback(async (start: string, end: string) => {
    setLoadingBranches(true);
    const branches = await getAdminBranches();
    const initial: BranchRow[] = branches.map(b => ({ branch: b, data: null, loading: true }));
    setRows(initial);
    setLoadingBranches(false);

    const results = await Promise.all(
      branches.map(b => getAdminCashData(b.id, start, end).catch(() => null))
    );
    setRows(branches.map((b, i) => ({ branch: b, data: results[i], loading: false })));
  }, []);

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd)) return;
    const { start, end } = getDateRange(period, customStart, customEnd);
    loadAll(start, end);
  }, [period, customStart, customEnd, loadAll]);

  const loadedRows = rows.filter(r => !r.loading && r.data);
  const totalCash = loadedRows.reduce((s, r) => s + (r.data?.systemCash ?? 0), 0);
  const totalKaspi = loadedRows.reduce((s, r) => s + (r.data?.systemKaspi ?? 0), 0);
  const totalAll = totalCash + totalKaspi;

  return (
    <div
      className="flex flex-col h-full"
      onTouchStart={e => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={e => {
        e.stopPropagation();
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        if (dx > 80 && Math.abs(dy) < 60 && touchStartX.current < window.innerWidth * 0.7) {
          onBack?.();
        }
      }}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-lg font-bold text-gray-900">Касса</h1>
      </div>

      <PeriodTabs
        period={period}
        onChange={setPeriod}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
      />

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {/* Сводная карточка всех филиалов */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
          <p className="font-semibold text-gray-900 mb-3">Все филиалы</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Нал</p>
              <p className="text-sm font-bold text-gray-900">{fmt(totalCash)}</p>
            </div>
            <div className="bg-white/60 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Kaspi</p>
              <p className="text-sm font-bold text-gray-900">{fmt(totalKaspi)}</p>
            </div>
            <div className="bg-emerald-500/20 rounded-lg p-2 text-center">
              <p className="text-[10px] text-emerald-700 uppercase tracking-wide">Итого</p>
              <p className="text-sm font-bold text-emerald-800">{fmt(totalAll)}</p>
            </div>
          </div>
        </div>

        {loadingBranches ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          rows.map(({ branch, data, loading }) => (
            <button
              key={branch.id}
              type="button"
              onClick={() => onSelect(branch)}
              className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-gray-900">{branch.name}</span>
                <SessionBadge session={data?.session ?? null} />
              </div>

              {loading ? (
                <div className="flex justify-center py-2">
                  <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : data ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Нал</p>
                    <p className="text-sm font-bold text-gray-900">{fmt(data.systemCash)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Kaspi</p>
                    <p className="text-sm font-bold text-gray-900">{fmt(data.systemKaspi)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2 text-center">
                    <p className="text-[10px] text-emerald-600 uppercase tracking-wide">Итого</p>
                    <p className="text-sm font-bold text-emerald-700">{fmt(data.systemTotal)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-1">Ошибка загрузки</p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Экран 2: детальный вид филиала ───────────────────────────────────────

interface DetailScreenProps {
  branch: Branch;
  onBack: () => void;
}

function DetailScreen({ branch, onBack }: DetailScreenProps) {
  const [period, setPeriod] = useState<PeriodTab>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<AdminCashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stockValue, setStockValue] = useState<number | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    getAdminStockValue(branch.id)
      .then(v => setStockValue(v))
      .catch(() => setStockValue(null));
  }, [branch.id]);

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd)) return;
    const { start, end } = getDateRange(period, customStart, customEnd);
    setLoading(true);
    getAdminCashData(branch.id, start, end)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [branch.id, period, customStart, customEnd]);

  const hasWorkshop =
    data &&
    (data.workshopPrepaidCash + data.workshopPrepaidKaspi +
      data.workshopRemainingCash + data.workshopRemainingKaspi +
      data.refundCash + data.refundKaspi) > 0;

  const hasReturns = data && data.returnsCash > 0;
  const hasExpenses = data && (data.expensesCash + data.expensesKaspi) > 0;

  return (
    <div
      className="flex flex-col h-full"
      onTouchStart={e => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
      }}
      onTouchEnd={e => {
        e.stopPropagation();
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        if (dx > 80 && Math.abs(dy) < 60 && touchStartX.current < window.innerWidth * 0.7) {
          onBack();
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-base font-bold text-gray-900 flex-1 truncate">{branch.name}</h1>
      </div>

      <PeriodTabs
        period={period}
        onChange={setPeriod}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
      />

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* Статус сессии */}
            <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
              <span className="text-sm text-gray-600">Сессия кассы</span>
              <SessionBadge session={data.session} />
            </div>

            {/* Продажи */}
            <Section title="Продажи">
              <Row label="Наличные" value={data.salesCash} />
              <Row label="Kaspi" value={data.salesKaspi} />
              {data.salesCount > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Кол-во продаж</span>
                    <span className="font-medium text-gray-900">{data.salesCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Средний чек</span>
                    <span className="font-medium text-gray-900">{fmt(data.avgCheck)}</span>
                  </div>
                </>
              )}
            </Section>

            {/* Склад филиала */}
            {stockValue !== null && (
              <Section title="Склад филиала">
                <Row label="Остаток товара" value={stockValue} />
              </Section>
            )}

            {/* Мастерская */}
            {hasWorkshop && (
              <Section title="Мастерская">
                {(data.workshopPrepaidCash > 0 || data.workshopPrepaidKaspi > 0) && (
                  <>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Предоплаты</p>
                    {data.workshopPrepaidCash > 0 && (
                      <Row label="Наличные" value={data.workshopPrepaidCash} />
                    )}
                    {data.workshopPrepaidKaspi > 0 && (
                      <Row label="Kaspi" value={data.workshopPrepaidKaspi} />
                    )}
                  </>
                )}
                {(data.workshopRemainingCash > 0 || data.workshopRemainingKaspi > 0) && (
                  <>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mt-2 mb-1">Доплаты</p>
                    {data.workshopRemainingCash > 0 && (
                      <Row label="Наличные" value={data.workshopRemainingCash} />
                    )}
                    {data.workshopRemainingKaspi > 0 && (
                      <Row label="Kaspi" value={data.workshopRemainingKaspi} />
                    )}
                  </>
                )}
                {(data.refundCash > 0 || data.refundKaspi > 0) && (
                  <>
                    <p className="text-xs text-gray-400 uppercase tracking-wide mt-2 mb-1">Возвраты предоплат</p>
                    {data.refundCash > 0 && (
                      <Row label="Наличные" value={-data.refundCash} red />
                    )}
                    {data.refundKaspi > 0 && (
                      <Row label="Kaspi" value={-data.refundKaspi} red />
                    )}
                  </>
                )}
              </Section>
            )}

            {/* Возвраты товаров */}
            {hasReturns && (
              <Section title="Возвраты товаров">
                <Row label="Наличные" value={-data.returnsCash} red />
              </Section>
            )}

            {/* Расходы */}
            {hasExpenses && (
              <Section title="Расходы">
                {data.expenseItems.map(item => (
                  <Row key={item.name} label={item.name} value={-item.amount} red />
                ))}
                {data.expensesCash > 0 && data.expensesKaspi > 0 && (
                  <div className="border-t border-gray-100 mt-1 pt-1.5">
                    <Row label="Итого расходов" value={-(data.expensesCash + data.expensesKaspi)} red bold />
                  </div>
                )}
              </Section>
            )}

            {/* Итоговые суммы */}
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4 space-y-2">
              <Row label="К сдаче наличными" value={data.systemCash - data.expensesCash} bold />
              <Row label="Kaspi итого" value={data.systemKaspi - data.expensesKaspi} bold />
              <div className="border-t border-emerald-200 pt-2 mt-1">
                <Row label="Всего" value={data.systemTotal - data.expensesCash - data.expensesKaspi} bold />
              </div>
            </div>

            {/* Данные закрытой сессии */}
            {data.session?.status === 'closed' && data.session.actual_cash !== null && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Итоги закрытия</p>
                <Row label="Сдано наличными" value={data.session.actual_cash} bold />
                {data.session.cash_discrepancy !== null && data.session.cash_discrepancy !== 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Расхождение</span>
                    <span className={`font-semibold ${data.session.cash_discrepancy > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmt(Math.abs(data.session.cash_discrepancy))}
                      {data.session.cash_discrepancy > 0 ? ' (недостача)' : ' (излишек)'}
                    </span>
                  </div>
                )}
                {(data.session.cash_discrepancy === null || data.session.cash_discrepancy === 0) && (
                  <div className="flex items-center gap-1 text-sm text-emerald-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>Расхождений нет</span>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-gray-400 py-10">Нет данных</p>
        )}
      </div>
    </div>
  );
}

// ─── Вспомогательные компоненты ───────────────────────────────────────────

function SessionBadge({ session }: { session: AdminCashData['session'] }) {
  if (!session) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
        <Minus className="w-3 h-3" /> Нет сессии
      </span>
    );
  }
  const hasDiscrepancy =
    session.status === 'closed' &&
    session.cash_discrepancy !== null &&
    Math.abs(session.cash_discrepancy) > 0;

  if (hasDiscrepancy) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3.5 h-3.5" /> Расхождение
      </span>
    );
  }
  if (session.status === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
        <CheckCircle className="w-3.5 h-3.5" /> Закрыта
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
      <Clock className="w-3.5 h-3.5" /> Открыта
    </span>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: number;
  red?: boolean;
  bold?: boolean;
}

function Row({ label, value, red, bold }: RowProps) {
  const textColor = red ? 'text-red-500' : 'text-gray-900';
  const weight = bold ? 'font-bold' : 'font-medium';
  return (
    <div className={`flex justify-between text-sm ${bold ? 'text-base' : ''}`}>
      <span className={bold ? 'font-semibold text-gray-800' : 'text-gray-600'}>{label}</span>
      <span className={`${textColor} ${weight}`}>
        {red ? '−' : ''}{fmt(Math.abs(value))}
      </span>
    </div>
  );
}

// ─── Основной компонент ───────────────────────────────────────────────────

interface Props {
  onBack?: () => void;
}

export default function AdminCashView({ onBack }: Props) {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  if (selectedBranch) {
    return (
      <DetailScreen
        branch={selectedBranch}
        onBack={() => setSelectedBranch(null)}
      />
    );
  }

  return <ListScreen onSelect={setSelectedBranch} onBack={onBack} />;
}

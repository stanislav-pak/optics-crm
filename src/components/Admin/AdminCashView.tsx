import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, AlertTriangle, CheckCircle, Clock, Minus } from 'lucide-react';
import type { Branch } from '../../types';
import { getAdminBranches, getAdminCashData, type AdminCashData } from '../../services/cashAdmin';

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

interface BranchRow {
  branch: Branch;
  data: AdminCashData | null;
  loading: boolean;
}

// ─── Экран 1: список филиалов ──────────────────────────────────────────────

interface ListScreenProps {
  onSelect: (branch: Branch) => void;
}

function ListScreen({ onSelect }: ListScreenProps) {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);

  const loadAll = useCallback(async (d: string) => {
    setLoadingBranches(true);
    const branches = await getAdminBranches();
    const initial: BranchRow[] = branches.map(b => ({ branch: b, data: null, loading: true }));
    setRows(initial);
    setLoadingBranches(false);

    const results = await Promise.all(
      branches.map(b =>
        getAdminCashData(b.id, d).catch(() => null)
      )
    );
    setRows(branches.map((b, i) => ({ branch: b, data: results[i], loading: false })));
  }, []);

  useEffect(() => { loadAll(date); }, [date, loadAll]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="text-lg font-bold text-gray-900">Касса</h1>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
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
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<AdminCashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAdminCashData(branch.id, date)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [branch.id, date]);

  const hasWorkshop =
    data &&
    (data.workshopPrepaidCash + data.workshopPrepaidKaspi +
      data.workshopRemainingCash + data.workshopRemainingKaspi +
      data.refundCash + data.refundKaspi) > 0;

  const hasReturns = data && data.returnsCash > 0;
  const hasExpenses = data && (data.expensesCash + data.expensesKaspi) > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-bold text-gray-900">{branch.name}</h1>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
            </Section>

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

export default function AdminCashView() {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  if (selectedBranch) {
    return (
      <DetailScreen
        branch={selectedBranch}
        onBack={() => setSelectedBranch(null)}
      />
    );
  }

  return <ListScreen onSelect={setSelectedBranch} />;
}

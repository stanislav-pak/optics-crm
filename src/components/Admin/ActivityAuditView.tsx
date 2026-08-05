import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../services/supabase';
import {
  getActivityAudit,
  type ActivityAuditEntry, type ActivityAuditCursor, type AuditAction,
} from '../../services/activityAudit';
import { getActivityAuditSummary, getEntityLabel, ENTITY_LABELS } from '../../utils/activityAuditSummary';

interface Branch { id: string; name: string; }
interface EmployeeOption { id: string; name: string; }

const ACTION_LABEL: Record<AuditAction, string> = {
  create: 'Создание',
  update: 'Изменение',
  delete: 'Удаление',
};

const ACTION_BADGE: Record<AuditAction, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-600',
};

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ActivityAuditView() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [branchId, setBranchId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [action, setAction] = useState<AuditAction | ''>('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [entries, setEntries] = useState<ActivityAuditEntry[]>([]);
  const [cursor, setCursor] = useState<ActivityAuditCursor | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Защита от гонки: при быстрой смене фильтров более старый запрос может
  // резолвиться позже нового — применяем только результат последнего запроса.
  const requestSeqRef = useRef(0);

  useEffect(() => {
    supabase.from('branches').select('id, name').order('name')
      .then(({ data }) => setBranches(data ?? []));
    supabase.from('employees').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  const filters = { branchId, employeeId, action: action || undefined, entityType: entityType || undefined, dateFrom, dateTo };
  const filtersKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const page = await getActivityAudit(filters);
      if (seq !== requestSeqRef.current) return; // устарел — фильтр уже сменился снова
      setEntries(page.items);
      setCursor(page.nextCursor);
    } catch (e: any) {
      if (seq !== requestSeqRef.current) return;
      setError(e?.message ?? 'Ошибка загрузки журнала');
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => { load(); }, [load]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const seq = requestSeqRef.current; // фильтры не менялись с последнего load()
    setLoadingMore(true);
    try {
      const page = await getActivityAudit(filters, cursor);
      if (seq !== requestSeqRef.current) return; // фильтр сменился, пока грузили следующую страницу
      setEntries(prev => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e: any) {
      if (seq !== requestSeqRef.current) return;
      setError(e?.message ?? 'Ошибка загрузки журнала');
    } finally {
      setLoadingMore(false);
    }
  }

  const hasFilters = !!(branchId || employeeId || action || entityType || dateFrom || dateTo);
  const resetFilters = () => {
    setBranchId(''); setEmployeeId(''); setAction(''); setEntityType(''); setDateFrom(''); setDateTo('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Фильтры */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-2 flex-shrink-0">
        <div className="flex gap-2 flex-wrap">
          <select
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">Все филиалы</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select
            value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">Все сотрудники</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>

          <select
            value={action}
            onChange={e => setAction(e.target.value as AuditAction | '')}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">Все действия</option>
            <option value="create">Создание</option>
            <option value="update">Изменение</option>
            <option value="delete">Удаление</option>
          </select>

          <select
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
          >
            <option value="">Все сущности</option>
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          {hasFilters && (
            <button onClick={resetFilters} className="text-xs text-gray-400 hover:text-gray-600 px-2">
              ✕ Сбросить
            </button>
          )}
          <button onClick={load} disabled={loading}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50">
            {loading ? '↻' : '↺'} Обновить
          </button>
        </div>
      </div>

      {/* Список */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-10">Загрузка...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Записей нет</p>
        ) : (
          entries.map(entry => {
            const isExpanded = expandedId === entry.id;
            return (
              <div key={entry.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_BADGE[entry.action]}`}>
                        {ACTION_LABEL[entry.action]}
                      </span>
                      <span className="text-xs text-gray-400">{getEntityLabel(entry.entity_type)}</span>
                      {entry.source === 'system' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Система</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 mt-1">{getActivityAuditSummary(entry)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">{fmtDateTime(entry.created_at)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
                  <span>
                    {entry.actor?.name ?? (entry.source === 'system' ? 'Система' : '—')}
                    {entry.actor_role ? ` · ${entry.actor_role}` : ''}
                    {entry.branch?.name ? ` · ${entry.branch.name}` : ''}
                  </span>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="text-emerald-600 hover:underline flex-shrink-0"
                  >
                    {isExpanded ? 'Скрыть' : 'Подробнее'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {entry.old_data && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Было</p>
                        <pre className="text-[11px] bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(entry.old_data, null, 2)}
                        </pre>
                      </div>
                    )}
                    {entry.new_data && (
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Стало</p>
                        <pre className="text-[11px] bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(entry.new_data, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {!loading && cursor && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-2.5 text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl font-medium disabled:opacity-50"
          >
            {loadingMore ? 'Загружаем...' : 'Показать ещё'}
          </button>
        )}
      </div>
    </div>
  );
}

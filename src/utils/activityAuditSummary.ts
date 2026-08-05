import type { ActivityAuditEntry } from '../services/activityAudit';

export const ENTITY_LABELS: Record<string, string> = {
  products: 'Товар',
  sales: 'Продажа',
  employees: 'Сотрудник',
  branches: 'Филиал',
  stock_requests: 'Заявка на склад',
  expenses: 'Расход',
  clients: 'Клиент',
  service_orders: 'Заказ мастерской',
  revisions: 'Ревизия',
};

// Только поля, которые осмысленно показать как есть (без резолва внешних id
// в читаемое имя — например branch_id у employees сюда намеренно не включён).
const FIELD_LABELS: Record<string, Record<string, string>> = {
  products: { name: 'название', price: 'цена', cost_price: 'себестоимость', is_active: 'активен' },
  sales: { status: 'статус', total: 'сумма', debt_amount: 'долг' },
  employees: { name: 'имя', role: 'роль', is_active: 'активен' },
  branches: { name: 'название', address: 'адрес', is_workshop: 'мастерская' },
  stock_requests: { status: 'статус' },
  expenses: { amount: 'сумма', description: 'описание' },
  clients: { name: 'имя', phone: 'телефон', status: 'статус' },
  service_orders: { status: 'статус', service_price: 'цена услуги', parts_price: 'цена запчастей' },
  revisions: { status: 'статус' },
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v === 'number') return v.toLocaleString('ru-RU');
  return String(v);
}

export function getEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

// Человекочитаемое summary из old_data/new_data. Для update — только поля из
// FIELD_LABELS, которые реально изменились («цена: 12000→9000»); остальные
// поля игнорируются (не интересны для контроля или требуют резолва id→имя,
// который здесь не делаем).
export function getActivityAuditSummary(entry: ActivityAuditEntry): string {
  const entityLabel = getEntityLabel(entry.entity_type);

  if (entry.action === 'create') return `Создан: ${entityLabel}`;
  if (entry.action === 'delete') return `Удалён: ${entityLabel}`;

  const fields = FIELD_LABELS[entry.entity_type] ?? {};
  const before = entry.old_data ?? {};
  const after = entry.new_data ?? {};
  const changes: string[] = [];

  for (const [key, label] of Object.entries(fields)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push(`${label}: ${formatValue(a)}→${formatValue(b)}`);
    }
  }

  if (changes.length === 0) return `Изменён: ${entityLabel}`;
  return changes.join(', ');
}

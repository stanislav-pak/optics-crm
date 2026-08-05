import { supabase } from './supabase';

export type AuditAction = 'create' | 'update' | 'delete';

// Список сущностей соответствует таблицам, на которых стоит триггер
// log_activity_audit (миграция 20260806_activity_audit.sql).
export type AuditEntityType =
  | 'products' | 'sales' | 'employees' | 'branches' | 'stock_requests'
  | 'expenses' | 'clients' | 'service_orders' | 'revisions';

export interface ActivityAuditEntry {
  id: string;
  created_at: string;
  actor_employee_id: string | null;
  actor_role: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  branch_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  source: 'app' | 'system';
  actor?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
}

export interface ActivityAuditFilters {
  branchId?: string;
  employeeId?: string;
  action?: AuditAction;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ActivityAuditCursor {
  createdAt: string;
  id: string;
}

export interface ActivityAuditPage {
  items: ActivityAuditEntry[];
  nextCursor: ActivityAuditCursor | null;
}

export const ACTIVITY_AUDIT_PAGE_SIZE = 50;
const PAGE_SIZE = ACTIVITY_AUDIT_PAGE_SIZE;

export async function getActivityAudit(
  filters: ActivityAuditFilters = {},
  cursor?: ActivityAuditCursor | null
): Promise<ActivityAuditPage> {
  let query = supabase
    .from('activity_audit')
    .select('*, actor:employees(id, name), branch:branches(id, name)')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);

  if (filters.branchId) query = query.eq('branch_id', filters.branchId);
  if (filters.employeeId) query = query.eq('actor_employee_id', filters.employeeId);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.entityType) query = query.eq('entity_type', filters.entityType);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo + 'T23:59:59');

  // Курсорная пагинация по (created_at, id) — устойчива к записям с одинаковым
  // created_at (одна транзакция могла затронуть несколько строк).
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = (data ?? []) as ActivityAuditEntry[];
  const last = items[items.length - 1];
  const nextCursor: ActivityAuditCursor | null =
    items.length === PAGE_SIZE && last ? { createdAt: last.created_at, id: last.id } : null;

  return { items, nextCursor };
}

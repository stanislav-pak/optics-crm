import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getActivityAudit, ACTIVITY_AUDIT_PAGE_SIZE } from '@/services/activityAudit'
import { supabase } from '@/services/supabase'

const CHAIN_METHODS = ['select', 'order', 'limit', 'eq', 'gte', 'lte', 'or'] as const

function mockAuditQuery(rows: unknown[], error: { message: string } | null = null) {
  const chain: any = {}
  for (const method of CHAIN_METHODS) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: any) => resolve({ data: error ? null : rows, error })
  vi.mocked(supabase.from).mockReturnValue(chain)
  return chain
}

describe('getActivityAudit', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('запрашивает таблицу activity_audit, сортируя по created_at и id по убыванию', async () => {
    const chain = mockAuditQuery([])
    await getActivityAudit({})
    expect(supabase.from).toHaveBeenCalledWith('activity_audit')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.order).toHaveBeenCalledWith('id', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(ACTIVITY_AUDIT_PAGE_SIZE)
  })

  it('применяет все переданные фильтры', async () => {
    const chain = mockAuditQuery([])
    await getActivityAudit({
      branchId: 'b1',
      employeeId: 'e1',
      action: 'update',
      entityType: 'products',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-06',
    })
    expect(chain.eq).toHaveBeenCalledWith('branch_id', 'b1')
    expect(chain.eq).toHaveBeenCalledWith('actor_employee_id', 'e1')
    expect(chain.eq).toHaveBeenCalledWith('action', 'update')
    expect(chain.eq).toHaveBeenCalledWith('entity_type', 'products')
    expect(chain.gte).toHaveBeenCalledWith('created_at', '2026-08-01')
    expect(chain.lte).toHaveBeenCalledWith('created_at', '2026-08-06T23:59:59')
  })

  it('без фильтров не трогает .eq/.gte/.lte/.or вообще', async () => {
    const chain = mockAuditQuery([])
    await getActivityAudit({})
    expect(chain.eq).not.toHaveBeenCalled()
    expect(chain.gte).not.toHaveBeenCalled()
    expect(chain.lte).not.toHaveBeenCalled()
    expect(chain.or).not.toHaveBeenCalled()
  })

  it('курсор строит OR-фильтр по паре (created_at, id) — не только по created_at', async () => {
    const chain = mockAuditQuery([])
    await getActivityAudit({}, { createdAt: '2026-08-06T10:00:00Z', id: 'a1' })
    expect(chain.or).toHaveBeenCalledWith(
      'created_at.lt.2026-08-06T10:00:00Z,and(created_at.eq.2026-08-06T10:00:00Z,id.lt.a1)'
    )
  })

  it('nextCursor указывает на последнюю запись, если страница полная', async () => {
    const rows = Array.from({ length: ACTIVITY_AUDIT_PAGE_SIZE }, (_, i) => ({
      id: `id-${i}`,
      created_at: `2026-08-06T10:${String(i).padStart(2, '0')}:00Z`,
    }))
    mockAuditQuery(rows)
    const page = await getActivityAudit({})
    expect(page.items).toHaveLength(ACTIVITY_AUDIT_PAGE_SIZE)
    const last = rows[rows.length - 1]
    expect(page.nextCursor).toEqual({ createdAt: last.created_at, id: last.id })
  })

  it('nextCursor === null, если страница неполная (последняя страница)', async () => {
    mockAuditQuery([{ id: 'a1', created_at: '2026-08-06T10:00:00Z' }])
    const page = await getActivityAudit({})
    expect(page.nextCursor).toBeNull()
  })

  it('пробрасывает ошибку supabase', async () => {
    mockAuditQuery([], { message: 'boom' })
    await expect(getActivityAudit({})).rejects.toBeTruthy()
  })
})

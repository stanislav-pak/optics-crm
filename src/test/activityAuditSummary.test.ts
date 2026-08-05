import { describe, it, expect } from 'vitest'
import { getActivityAuditSummary, getEntityLabel } from '@/utils/activityAuditSummary'
import type { ActivityAuditEntry } from '@/services/activityAudit'

function makeEntry(overrides: Partial<ActivityAuditEntry>): ActivityAuditEntry {
  return {
    id: 'a1',
    created_at: '2026-08-06T10:00:00Z',
    actor_employee_id: 'e1',
    actor_role: 'manager',
    action: 'update',
    entity_type: 'products',
    entity_id: 'p1',
    branch_id: 'b1',
    old_data: null,
    new_data: null,
    source: 'app',
    ...overrides,
  }
}

describe('getEntityLabel', () => {
  it('переводит известные типы сущностей на русский', () => {
    expect(getEntityLabel('products')).toBe('Товар')
    expect(getEntityLabel('sales')).toBe('Продажа')
    expect(getEntityLabel('employees')).toBe('Сотрудник')
  })

  it('возвращает исходную строку для неизвестного типа', () => {
    expect(getEntityLabel('unknown_table')).toBe('unknown_table')
  })
})

describe('getActivityAuditSummary', () => {
  it('create → "Создан: <сущность>"', () => {
    const entry = makeEntry({ action: 'create', entity_type: 'clients', new_data: { name: 'Аружан' } })
    expect(getActivityAuditSummary(entry)).toBe('Создан: Клиент')
  })

  it('delete → "Удалён: <сущность>"', () => {
    const entry = makeEntry({ action: 'delete', entity_type: 'expenses', old_data: { amount: 5000 } })
    expect(getActivityAuditSummary(entry)).toBe('Удалён: Расход')
  })

  it('update: показывает изменение цены товара с форматированием чисел', () => {
    const entry = makeEntry({
      entity_type: 'products',
      old_data: { price: 12000, name: 'Оправа' },
      new_data: { price: 9000, name: 'Оправа' },
    })
    const priceFrom = (12000).toLocaleString('ru-RU')
    const priceTo = (9000).toLocaleString('ru-RU')
    expect(getActivityAuditSummary(entry)).toBe(`цена: ${priceFrom}→${priceTo}`)
  })

  it('update: несколько изменённых полей объединяются через запятую', () => {
    const entry = makeEntry({
      entity_type: 'sales',
      old_data: { status: 'paid', total: 1000 },
      new_data: { status: 'refunded', total: 1000 },
    })
    expect(getActivityAuditSummary(entry)).toBe('статус: paid→refunded')
  })

  it('update: булево форматируется как да/нет', () => {
    const entry = makeEntry({
      entity_type: 'products',
      old_data: { is_active: true },
      new_data: { is_active: false },
    })
    expect(getActivityAuditSummary(entry)).toBe('активен: да→нет')
  })

  it('update: null форматируется как тире', () => {
    const entry = makeEntry({
      entity_type: 'branches',
      old_data: { address: null },
      new_data: { address: 'Абая 34' },
    })
    expect(getActivityAuditSummary(entry)).toBe('адрес: —→Абая 34')
  })

  it('update: если ни одно отслеживаемое поле не изменилось — общее "Изменён"', () => {
    const entry = makeEntry({
      entity_type: 'products',
      old_data: { price: 1000, updated_at: '2026-08-01' },
      new_data: { price: 1000, updated_at: '2026-08-06' },
    })
    expect(getActivityAuditSummary(entry)).toBe('Изменён: Товар')
  })

  it('update: неизвестный тип сущности — нет отслеживаемых полей, общее "Изменён"', () => {
    const entry = makeEntry({ entity_type: 'unknown_table', old_data: { x: 1 }, new_data: { x: 2 } })
    expect(getActivityAuditSummary(entry)).toBe('Изменён: unknown_table')
  })
})

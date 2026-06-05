import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ServiceOrderCard from '@/components/Workshop/ServiceOrderCard'
import AddServiceOrderModal from '@/components/Workshop/AddServiceOrderModal'
import { fetchServiceOrders, updateServiceOrderStatus } from '@/services/workshop'
import type { ServiceOrder, Service } from '@/types'

// ──────────────────────────────────────────────
// Фикстуры
// ──────────────────────────────────────────────

const mockOrder: ServiceOrder = {
  id: '1',
  branch_id: 'branch-1',
  client_name: 'Иван Иванов',
  client_phone: '+7 777 000 00 00',
  employee_id: 'emp-1',
  service_name: 'Ремонт оправы',
  status: 'new',
  price: 1000,
  prepayment: 500,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const mockServices: Service[] = [
  {
    id: 'svc-1',
    branch_id: null,
    name: 'Ремонт оправы',
    price: 1000,
    is_active: true,
    created_at: new Date().toISOString(),
  },
]

// ──────────────────────────────────────────────
// 1. ServiceOrderCard — статус-бейджи
// ──────────────────────────────────────────────

describe('ServiceOrderCard', () => {
  it('рендерится с правильным статус-бейджем "Новый"', () => {
    render(<ServiceOrderCard order={mockOrder} onStatusChange={vi.fn()} />)
    expect(screen.getByText('Новый')).toBeInTheDocument()
    expect(screen.getByText('Иван Иванов')).toBeInTheDocument()
    expect(screen.getByText('Ремонт оправы')).toBeInTheDocument()
  })

  it('показывает бейдж "В работе" для статуса in_progress', () => {
    render(
      <ServiceOrderCard
        order={{ ...mockOrder, status: 'in_progress' }}
        onStatusChange={vi.fn()}
      />
    )
    expect(screen.getByText('В работе')).toBeInTheDocument()
  })

  it('показывает бейдж "Готов" для статуса ready', () => {
    render(
      <ServiceOrderCard order={{ ...mockOrder, status: 'ready' }} onStatusChange={vi.fn()} />
    )
    expect(screen.getByText('Готов')).toBeInTheDocument()
  })

  it('показывает бейдж "Выдан" для статуса done', () => {
    render(
      <ServiceOrderCard order={{ ...mockOrder, status: 'done' }} onStatusChange={vi.fn()} />
    )
    expect(screen.getByText('Выдан')).toBeInTheDocument()
  })

  it('показывает бейдж "Отменён" для статуса cancelled', () => {
    render(
      <ServiceOrderCard order={{ ...mockOrder, status: 'cancelled' }} onStatusChange={vi.fn()} />
    )
    expect(screen.getByText('Отменён')).toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// 2. AddServiceOrderModal — рендер формы
// ──────────────────────────────────────────────

describe('AddServiceOrderModal', () => {
  it('показывает форму при открытии', () => {
    render(
      <AddServiceOrderModal
        branchId="branch-1"
        employeeId="emp-1"
        services={mockServices}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    expect(screen.getByText('Новый заказ')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Иванов Иван')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('+7 777 000 00 00')).toBeInTheDocument()
  })

  // ──────────────────────────────────────────────
  // 3. AddServiceOrderModal — onClose при Отмена
  // ──────────────────────────────────────────────

  it('вызывает onClose при нажатии кнопки Отмена', () => {
    const onClose = vi.fn()
    render(
      <AddServiceOrderModal
        branchId="branch-1"
        employeeId="emp-1"
        services={mockServices}
        onClose={onClose}
        onSuccess={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Отмена'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('кнопка «Создать заказ» задизейблена без заполненных полей', () => {
    render(
      <AddServiceOrderModal
        branchId="branch-1"
        employeeId="emp-1"
        services={mockServices}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    const btn = screen.getByText('Создать заказ')
    expect(btn).toBeDisabled()
  })
})

// ──────────────────────────────────────────────
// 4. fetchServiceOrders — вызов supabase
// ──────────────────────────────────────────────

describe('workshop сервисные функции', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchServiceOrders вызывает supabase.from("service_orders")', async () => {
    const { supabase } = await import('@/services/supabase')
    const fromSpy = vi.mocked(supabase.from)

    // from() вызывается синхронно до первого await внутри функции
    fetchServiceOrders('branch-1').catch(() => {})

    expect(fromSpy).toHaveBeenCalledWith('service_orders')
  })

  // ──────────────────────────────────────────────
  // 5. updateServiceOrderStatus — вызов update
  // ──────────────────────────────────────────────

  it('updateServiceOrderStatus вызывает update с правильным статусом', async () => {
    const { supabase } = await import('@/services/supabase')
    const fromSpy = vi.mocked(supabase.from)

    updateServiceOrderStatus('order-1', 'in_progress').catch(() => {})

    expect(fromSpy).toHaveBeenCalledWith('service_orders')

    // Получаем объект, который вернул from(), и проверяем, что update() вызван
    const queryObj = fromSpy.mock.results[0]?.value as {
      update: ReturnType<typeof vi.fn>
    } | undefined

    expect(queryObj?.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_progress' })
    )
  })

  // ──────────────────────────────────────────────
  // 6. fetchServiceOrders(null) — режим admin «Все»
  // ──────────────────────────────────────────────

  it('fetchServiceOrders(null) не фильтрует по branch_id', async () => {
    const { supabase } = await import('@/services/supabase')
    const fromSpy = vi.mocked(supabase.from)

    fetchServiceOrders(null).catch(() => {})

    expect(fromSpy).toHaveBeenCalledWith('service_orders')

    // eq('branch_id', ...) не должен вызываться при null
    const queryObj = fromSpy.mock.results[0]?.value as {
      eq: ReturnType<typeof vi.fn>
    } | undefined
    const eqCalls: unknown[][] = queryObj?.eq?.mock.calls ?? []
    expect(eqCalls.some(call => call[0] === 'branch_id')).toBe(false)
  })
})

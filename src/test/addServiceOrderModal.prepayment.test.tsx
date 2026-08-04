import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AddServiceOrderModal from '@/components/Workshop/AddServiceOrderModal'
import type { Service } from '@/types'

vi.mock('@/services/workshop', () => ({
  createServiceOrder: vi.fn().mockResolvedValue({ id: 'order-1' }),
  createService: vi.fn().mockResolvedValue({
    data: { id: 'svc-1', name: 'Ремонт оправы', price: 0, branch_id: null, is_active: true, created_at: new Date().toISOString() },
    error: null,
  }),
}))

import { createServiceOrder } from '@/services/workshop'

const mockServices: Service[] = []

function inputNearLabel(labelText: string): HTMLInputElement {
  const label = screen.getByText(labelText)
  const container = label.closest('div')
  const input = container?.querySelector('input')
  if (!input) throw new Error(`Input near label "${labelText}" not found`)
  return input as HTMLInputElement
}

// Услуга обязательна для submit, а список услуг пуст — заводим её инлайн через
// "+ Создать услугу", чтобы получить непустое serviceName/serviceId.
async function setupWithService() {
  const utils = render(
    <AddServiceOrderModal
      branchId="branch-1"
      employeeId="emp-1"
      services={mockServices}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />
  )
  fireEvent.change(screen.getByPlaceholderText('Иванов Иван'), { target: { value: 'Иван Иванов' } })
  fireEvent.click(screen.getByText('— выберите услугу —'))
  fireEvent.mouseDown(screen.getByText('+ Создать услугу'))
  fireEvent.change(screen.getByPlaceholderText('Название услуги'), { target: { value: 'Ремонт оправы' } })
  fireEvent.click(screen.getByText('Сохранить'))
  await waitFor(() => expect(screen.getByText('Ремонт оправы')).toBeInTheDocument())
  return utils
}

describe('AddServiceOrderModal — клемп предоплаты (прямое создание заказа мастерской)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('перепечатка стоимости услуги после ввода предоплаты не портит уже введённую предоплату', async () => {
    await setupWithService()
    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '2000' } })
    fireEvent.click(screen.getByText('Предоплата'))

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '1500' } })
    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('1500')

    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '500' } })
    expect(prepaymentInput.value).toBe('1500')
    expect(screen.getByText('Предоплата не может превышать стоимость услуги и запчастей')).toBeInTheDocument()
    expect(screen.getByText('Создать заказ')).toBeDisabled()

    fireEvent.blur(prepaymentInput)
    expect(prepaymentInput.value).toBe('500')
    expect(screen.getByText('Создать заказ')).not.toBeDisabled()
  })

  it('реальный submit отправляет клемпнутую предоплату в createServiceOrder', async () => {
    await setupWithService()
    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '1000' } })
    fireEvent.change(inputNearLabel('Стоимость запчастей ₸'), { target: { value: '200' } })
    fireEvent.click(screen.getByText('Предоплата'))

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '900' } })
    fireEvent.blur(prepaymentInput)

    fireEvent.click(screen.getByText('Создать заказ'))

    await waitFor(() => expect(createServiceOrder).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(createServiceOrder).mock.calls[0][0]
    expect(payload.prepayment).toBe(900)
    expect(payload.service_price).toBe(1000)
    expect(payload.parts_price).toBe(200)
  })

  it('не даёт создать заказ, если предоплата превышает стоимость даже без blur (кнопка задизейблена)', async () => {
    await setupWithService()
    fireEvent.change(inputNearLabel('Стоимость услуги ₸'), { target: { value: '300' } })
    fireEvent.click(screen.getByText('Предоплата'))

    const prepaymentInput = inputNearLabel('Сумма предоплаты ₸')
    fireEvent.change(prepaymentInput, { target: { value: '9999' } })

    const submitBtn = screen.getByText('Создать заказ')
    expect(submitBtn).toBeDisabled()
    fireEvent.click(submitBtn)
    expect(createServiceOrder).not.toHaveBeenCalled()
  })
})

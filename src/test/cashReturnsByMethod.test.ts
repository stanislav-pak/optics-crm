import { describe, it, expect } from 'vitest'
import {
  allocateReturnsByPaymentMethod,
  sumReturnedValueBySale,
  type SalePaidSplit,
} from '@/services/cashCalc'

// Баг: возврат товара всегда вычитался из НАЛИЧНЫХ, чем бы ни платили. Вернули
// товар, купленный по Kaspi — наличные занижались, Kaspi оставался завышенным,
// и у менеджера при закрытии смены вылезала ложная недостача.

function sale(p: Partial<SalePaidSplit>): SalePaidSplit {
  return { paid_cash: 0, paid_kaspi: 0, paid_halyk: 0, paid_kaspi_transfer: 0, ...p }
}

describe('allocateReturnsByPaymentMethod', () => {
  it('возврат Kaspi-продажи уменьшает Kaspi, а НЕ наличные', () => {
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 8000 },
      { 'sale-1': sale({ paid_kaspi: 8000 }) }
    )

    expect(r.kaspi).toBe(8000)
    expect(r.cash).toBe(0)
    expect(r.halyk).toBe(0)
    expect(r.kaspiTransfer).toBe(0)
  })

  it('возврат продажи за наличные уменьшает наличные (прежнее поведение не сломано)', () => {
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 13100 },
      { 'sale-1': sale({ paid_cash: 13100 }) }
    )

    expect(r.cash).toBe(13100)
    expect(r.kaspi).toBe(0)
  })

  it('возврат POST-продажи уменьшает POST, наличные не трогает', () => {
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 36500 },
      { 'sale-1': sale({ paid_halyk: 36500 }) }
    )

    expect(r.halyk).toBe(36500)
    expect(r.cash).toBe(0)
  })

  it('возврат Kaspi-перевода уменьшает перевод', () => {
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 5000 },
      { 'sale-1': sale({ paid_kaspi_transfer: 5000 }) }
    )

    expect(r.kaspiTransfer).toBe(5000)
    expect(r.cash).toBe(0)
  })

  // Смешанная оплата: позиция продажи не хранит, чем именно её оплатили,
  // поэтому делим пропорционально фактическим paid_*.
  it('смешанная оплата делится пропорционально, сумма долей = сумме возврата', () => {
    // Реальная продажа: 25200 наличными + 12000 Kaspi = 37200
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 37200 },
      { 'sale-1': sale({ paid_cash: 25200, paid_kaspi: 12000 }) }
    )

    expect(r.cash).toBe(25200)
    expect(r.kaspi).toBe(12000)
    expect(r.cash + r.kaspi).toBe(37200)
  })

  it('частичный возврат смешанной оплаты делится в той же пропорции', () => {
    // Половина от 37200 → половина каждого кармана
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 18600 },
      { 'sale-1': sale({ paid_cash: 25200, paid_kaspi: 12000 }) }
    )

    expect(r.cash).toBe(12600)
    expect(r.kaspi).toBe(6000)
    expect(r.cash + r.kaspi).toBe(18600)
  })

  // Округление не должно «испарять» деньги: сумма долей обязана сойтись.
  it('копейки округления не теряются — сумма долей равна возврату', () => {
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 1000 },
      { 'sale-1': sale({ paid_cash: 333, paid_kaspi: 333, paid_halyk: 334 }) }
    )

    expect(r.cash + r.kaspi + r.halyk + r.kaspiTransfer).toBe(1000)
  })

  // Продажа с долгом: получено меньше, чем стоит товар. Вернуть можно только
  // фактически полученное, иначе касса ушла бы в минус на несуществующие деньги.
  it('не вычитает больше, чем по продаже реально получено (продажа с долгом)', () => {
    // total 11000, оплачено Kaspi 8000, 3000 ушли в долг
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 11000 },
      { 'sale-1': sale({ paid_kaspi: 8000 }) }
    )

    expect(r.kaspi).toBe(8000)
    expect(r.cash).toBe(0)
  })

  it('по неоплаченной продаже не вычитает ничего', () => {
    const r = allocateReturnsByPaymentMethod({ 'sale-1': 5000 }, { 'sale-1': sale({}) })

    expect(r).toEqual({ cash: 0, kaspi: 0, halyk: 0, kaspiTransfer: 0 })
  })

  it('несколько возвращённых продаж суммируются по своим карманам', () => {
    const r = allocateReturnsByPaymentMethod(
      { 'sale-1': 5000, 'sale-2': 3000 },
      { 'sale-1': sale({ paid_kaspi: 5000 }), 'sale-2': sale({ paid_cash: 3000 }) }
    )

    expect(r.kaspi).toBe(5000)
    expect(r.cash).toBe(3000)
  })

  it('продажа, которую не удалось прочитать, молча пропускается', () => {
    const r = allocateReturnsByPaymentMethod({ 'sale-missing': 5000 }, {})

    expect(r).toEqual({ cash: 0, kaspi: 0, halyk: 0, kaspiTransfer: 0 })
  })
})

describe('sumReturnedValueBySale', () => {
  it('считает стоимость возврата по цене позиции в исходной продаже', () => {
    const bySale = sumReturnedValueBySale(
      [
        { quantity: 2, product_id: 'p1', reference_id: 'sale-1' },
        { quantity: 1, product_id: 'p2', reference_id: 'sale-1' },
      ],
      [
        { sale_id: 'sale-1', product_id: 'p1', price: 1500 },
        { sale_id: 'sale-1', product_id: 'p2', price: 500 },
      ]
    )

    expect(bySale['sale-1']).toBe(3500)
  })

  it('движение без ссылки на продажу игнорируется', () => {
    const bySale = sumReturnedValueBySale(
      [{ quantity: 1, product_id: 'p1', reference_id: null }],
      [{ sale_id: 'sale-1', product_id: 'p1', price: 1000 }]
    )

    expect(Object.keys(bySale)).toHaveLength(0)
  })
})

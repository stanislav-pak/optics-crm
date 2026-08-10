import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { computeCashTotals, type SalePaidSplit } from '@/services/cashCalc'

// ТЕСТ РАВЕНСТВА: серверный расчёт кассы против фронтового.
//
// Один и тот же набор данных прогоняется дважды — через SQL из миграции
// 20260811_compute_cash_session_totals.sql и через computeCashTotals() из
// services/cashCalc.ts. Суммы по каждому карману обязаны совпасть. Это и есть
// доказательство, что перенос расчёта на сервер меняет ИСТОЧНИК, а не цифры.
//
// SQL берётся ПРЯМО ИЗ ФАЙЛА МИГРАЦИИ и выполняется как обычный SELECT с
// подставленными параметрами — то есть проверяется ровно тот текст, который
// поедет в прод, и устанавливать функцию в базу для теста не требуется.
//
// Тест сетевой и выключен по умолчанию: в CI и при обычном `vitest run` он
// пропускается. Запуск вручную:
//   CASH_PARITY=1 CASH_PARITY_PROJECT=<ref> npx vitest run src/test/cashParity.db.test.ts
// Токен читается из ~/.supabase/access-token. Все запросы — read_only.

const ENABLED = process.env.CASH_PARITY === '1'
const PROJECT_REF = process.env.CASH_PARITY_PROJECT ?? ''
const TOKEN_PATH = process.env.CASH_PARITY_TOKEN
  ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.supabase', 'access-token')

const MIGRATION = path.join(
  process.cwd(), 'supabase', 'migrations', '20260811_compute_cash_session_totals.sql'
)

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function runSql<T = Record<string, unknown>>(sql: string, attempt = 0): Promise<T[]> {
  const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim()
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: true }),
    }
  )
  const text = await res.text()
  if (res.ok) return JSON.parse(text) as T[]

  // Управляющий API ограничивает частоту (429, иногда заглушка Cloudflare).
  // Настоящая ошибка SQL приходит с 400 и JSON-телом — её повторять незачем.
  const isThrottle = res.status !== 400
  if (isThrottle && attempt < 6) {
    await sleep(2000 * (attempt + 1))
    return runSql<T>(sql, attempt + 1)
  }
  throw new Error(`SQL failed (${res.status}): ${text.slice(0, 300)}`)
}

/**
 * Вырезает тело запроса из функции и подставляет параметры, чтобы выполнить его
 * как самостоятельный SELECT. Именно так проверяется текст миграции, а не его
 * пересказ в тесте.
 */
function inlineServerQuery(branchId: string, date: string, hasRemainingRefund: boolean): string {
  // Нормализуем переводы строк: на Windows файл может лежать с CRLF,
  // и разметка для вырезания ветки/подстановки перестала бы совпадать.
  // Переводы строк приводим к LF: на Windows файл может лежать с CRLF, и тогда
  // разметка для вырезания ветки и подстановки параметров не совпадёт.
  const sql = fs.readFileSync(MIGRATION, 'utf8').split('\r\n').join('\n')
  const start = sql.indexOf('RETURN QUERY')
  const end = sql.indexOf('ON true;', start)
  if (start === -1 || end === -1) throw new Error('Не найдено тело запроса в миграции')

  let body = sql.slice(start + 'RETURN QUERY'.length, end + 'ON true'.length)

  // Колонки «возврат доплаты мастерской» добавляет эта же миграция. Пока она не
  // применена, ветку вырезаем — на текущей схеме фронт по ней тоже даёт 0
  // (его запрос молча падает), так что равенство проверяется корректно.
  if (!hasRemainingRefund) {
    const marker = '    UNION ALL\n    -- Возвраты доплат мастерской (минус).'
    const cut = body.indexOf(marker)
    const cutEnd = body.indexOf('  ),', cut)
    if (cut !== -1 && cutEnd !== -1) body = body.slice(0, cut) + '\n' + body.slice(cutEnd)
  }

  return body
    .replace(/\bp_branch_id\b/g, `'${branchId}'::uuid`)
    .replace(/\bp_date\b/g, `'${date}'::date`)
    .replace(/\bv_from\b/g, `('${date} 00:00:00'::timestamp AT TIME ZONE 'UTC')`)
    .replace(/\bv_to\b/g, `('${date} 23:59:59'::timestamp AT TIME ZONE 'UTC')`)
}

async function hasRemainingRefundColumns(): Promise<boolean> {
  const rows = await runSql<{ n: number }>(
    `select count(*)::int as n from information_schema.columns
     where table_schema='public' and table_name='service_orders'
       and column_name in ('remaining_refunded_at','remaining_refund_method')`
  )
  return Number(rows[0]?.n ?? 0) === 2
}

const num = (v: unknown) => Number(v ?? 0)

/**
 * Те же выборки, что делают карточка кассы и админский свод, но одним запросом:
 * управляющий API ограничивает частоту, а сверяем мы все смены подряд.
 */
async function fetchFrontendInput(branchId: string, date: string, hasRemainingRefund: boolean) {
  const from = `'${date} 00:00:00'::timestamp AT TIME ZONE 'UTC'`
  const to = `'${date} 23:59:59'::timestamp AT TIME ZONE 'UTC'`
  const b = `'${branchId}'::uuid`
  const arr = (q: string) => `coalesce((select json_agg(t) from (${q}) t), '[]'::json)`

  const remainingRefundQuery = hasRemainingRefund
    ? `select service_price, parts_price, prepayment, original_prepayment, remaining_refund_method
       from service_orders where created_branch_id=${b}
         and remaining_refunded_at is not null
         and remaining_refunded_at >= ${from} and remaining_refunded_at <= ${to}`
    : `select 1 where false`

  const [row] = await runSql<{ data: Record<string, unknown[]> }>(`
    select json_build_object(
      'sales', ${arr(`select paid_cash, paid_kaspi, paid_halyk, paid_kaspi_transfer from sales
        where branch_id=${b} and status in ('paid','refunded','partially_refunded')
          and created_at >= ${from} and created_at <= ${to}`)},
      'wsPrepaid', ${arr(`select prepayment, prepayment_method from service_orders
        where created_branch_id=${b} and sale_id is null and prepayment_paid_at is not null
          and prepayment_paid_at >= ${from} and prepayment_paid_at <= ${to} and prepayment > 0`)},
      'wsRemaining', ${arr(`select service_price, parts_price, prepayment, original_prepayment,
          remaining_payment_method from service_orders where created_branch_id=${b}
          and remaining_paid_at is not null
          and remaining_paid_at >= ${from} and remaining_paid_at <= ${to}`)},
      'debt', ${arr(`select debt_amount, debt_payment_method from sales
        where branch_id=${b} and debt_paid_at is not null
          and debt_paid_at >= ${from} and debt_paid_at <= ${to}`)},
      'preorders', ${arr(`select prepayment_amount, prepayment_method from orders
        where branch_id=${b} and prepayment_paid_at is not null
          and prepayment_paid_at >= ${from} and prepayment_paid_at <= ${to}
          and prepayment_amount > 0 and status <> 'cancelled'`)},
      'prepayRefunds', ${arr(`select original_prepayment, prepayment_refund_method from service_orders
        where created_branch_id=${b} and prepayment_refunded_at is not null
          and prepayment_refunded_at >= ${from} and prepayment_refunded_at <= ${to}`)},
      'remainingRefunds', ${arr(remainingRefundQuery)},
      'movements', ${arr(`select quantity, product_id, reference_id from stock_movements
        where type='return' and branch_id=${b}
          and created_at >= ${from} and created_at <= ${to}`)},
      'expenses', ${arr(`select amount, payment_method from expenses
        where branch_id=${b} and date='${date}'::date`)},
      'returnSaleItems', ${arr(`select si.sale_id, si.product_id, si.price from sale_items si
        where si.sale_id in (select distinct m.reference_id from stock_movements m
          where m.type='return' and m.branch_id=${b}
            and m.created_at >= ${from} and m.created_at <= ${to}
            and m.reference_id is not null)`)},
      'returnSales', ${arr(`select s.id, s.paid_cash, s.paid_kaspi, s.paid_halyk, s.paid_kaspi_transfer
        from sales s where s.id in (select distinct m.reference_id from stock_movements m
          where m.type='return' and m.branch_id=${b}
            and m.created_at >= ${from} and m.created_at <= ${to}
            and m.reference_id is not null)`)}
    ) as data
  `)

  const d = row.data as Record<string, Record<string, unknown>[]>

  return {
    sales: d.sales.map(r => ({
      paid_cash: num(r.paid_cash), paid_kaspi: num(r.paid_kaspi),
      paid_halyk: num(r.paid_halyk), paid_kaspi_transfer: num(r.paid_kaspi_transfer),
    })),
    workshopPrepayments: d.wsPrepaid.map(r => ({
      prepayment: num(r.prepayment), prepayment_method: r.prepayment_method as string | null,
    })),
    workshopRemaining: d.wsRemaining.map(r => ({
      service_price: num(r.service_price), parts_price: num(r.parts_price),
      prepayment: num(r.prepayment),
      original_prepayment: r.original_prepayment === null ? null : num(r.original_prepayment),
      remaining_payment_method: r.remaining_payment_method as string | null,
    })),
    debtSettlements: d.debt.map(r => ({
      debt_amount: num(r.debt_amount), debt_payment_method: r.debt_payment_method as string | null,
    })),
    preorderPayments: d.preorders.map(r => ({
      prepayment_amount: num(r.prepayment_amount),
      prepayment_method: r.prepayment_method as string | null,
    })),
    prepaymentRefunds: d.prepayRefunds.map(r => ({
      original_prepayment: r.original_prepayment === null ? null : num(r.original_prepayment),
      prepayment_refund_method: r.prepayment_refund_method as string | null,
    })),
    remainingRefunds: d.remainingRefunds.map(r => ({
      service_price: num(r.service_price), parts_price: num(r.parts_price),
      prepayment: num(r.prepayment),
      original_prepayment: r.original_prepayment === null ? null : num(r.original_prepayment),
      remaining_refund_method: r.remaining_refund_method as string | null,
    })),
    returnMovements: d.movements.map(r => ({
      quantity: num(r.quantity), product_id: String(r.product_id),
      reference_id: r.reference_id === null ? null : String(r.reference_id),
    })),
    returnSaleItems: d.returnSaleItems.map(r => ({
      sale_id: String(r.sale_id), product_id: String(r.product_id), price: num(r.price),
    })),
    returnSales: d.returnSales.map(r => ({
      id: String(r.id),
      paid_cash: num(r.paid_cash), paid_kaspi: num(r.paid_kaspi),
      paid_halyk: num(r.paid_halyk), paid_kaspi_transfer: num(r.paid_kaspi_transfer),
    })) as ({ id: string } & SalePaidSplit)[],
    expenses: d.expenses.map(r => ({
      amount: num(r.amount), payment_method: r.payment_method as string | null,
    })),
  }
}

describe.skipIf(!ENABLED)('равенство: серверный расчёт кассы == фронтовый', () => {
  it('совпадает по каждому карману на всех сменах в базе', async () => {
    expect(PROJECT_REF, 'нужен CASH_PARITY_PROJECT').not.toBe('')

    const hasRemainingRefund = await hasRemainingRefundColumns()
    if (!hasRemainingRefund) {
      console.warn(
        '[parity] колонок remaining_refunded_at/remaining_refund_method ещё нет — ' +
        'ветка возврата доплаты исключена с ОБЕИХ сторон (на текущей схеме она даёт 0)'
      )
    }

    const sessions = await runSql<{ branch_id: string; date: string }>(
      `select branch_id, date::text as date from cash_sessions order by date`
    )
    expect(sessions.length, 'в базе нет смен для сверки').toBeGreaterThan(0)

    const mismatches: string[] = []

    for (const s of sessions) {
      await sleep(700) // не упираться в ограничение частоты управляющего API
      const [server] = await runSql(inlineServerQuery(s.branch_id, s.date, hasRemainingRefund))
      const front = computeCashTotals(
        await fetchFrontendInput(s.branch_id, s.date, hasRemainingRefund)
      )

      const pairs: [string, number, number][] = [
        ['sales_cash', num(server.sales_cash), front.sales.cash],
        ['sales_kaspi', num(server.sales_kaspi), front.sales.kaspi],
        ['sales_halyk', num(server.sales_halyk), front.sales.halyk],
        ['sales_kaspi_transfer', num(server.sales_kaspi_transfer), front.sales.kaspiTransfer],
        ['system_cash', num(server.system_cash), front.systemCash],
        ['system_kaspi', num(server.system_kaspi), front.systemKaspi],
        ['system_halyk', num(server.system_halyk), front.systemHalyk],
        ['system_kaspi_transfer', num(server.system_kaspi_transfer), front.systemKaspiTransfer],
        ['system_total', num(server.system_total), front.systemTotal],
        ['expenses_cash', num(server.expenses_cash), front.expensesCash],
        ['expenses_kaspi', num(server.expenses_kaspi), front.expensesKaspi],
      ]

      for (const [name, sv, fv] of pairs) {
        if (Math.abs(sv - fv) > 0.005) {
          mismatches.push(`${s.date} ${s.branch_id} ${name}: сервер ${sv} != фронт ${fv}`)
        }
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([])
  }, 180_000)
})

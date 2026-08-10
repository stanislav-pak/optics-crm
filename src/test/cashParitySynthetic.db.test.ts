import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { computeCashTotals } from '@/services/cashCalc'

// Краевые случаи серверного расчёта кассы на ВЫДУМАННЫХ данных.
//
// В боевой базе нет ни смешанной оплаты с возвратом, ни копеечных остатков, ни
// пустых цен — то есть самые рискованные ветки формулы на реальных сменах не
// исполняются ни разу, и сверка на живых данных их не покрывает.
//
// Здесь они проверяются на синтетике: CTE с именами реальных таблиц перекрывают
// эти таблицы внутри запроса (правило Postgres — имя из WITH имеет приоритет),
// поэтому выполняется ТОТ ЖЕ текст миграции, но поверх выдуманных строк. База
// при этом только читается: ничего не создаётся, не пишется и не удаляется.
//
// Запуск: CASH_PARITY=1 CASH_PARITY_PROJECT=<ref> npx vitest run src/test/cashParitySynthetic.db.test.ts

const ENABLED = process.env.CASH_PARITY === '1'
const PROJECT_REF = process.env.CASH_PARITY_PROJECT ?? ''
const TOKEN_PATH = process.env.CASH_PARITY_TOKEN
  ?? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.supabase', 'access-token')
const MIGRATION = path.join(
  process.cwd(), 'supabase', 'migrations', '20260811_compute_cash_session_totals.sql'
)

const BRANCH = '11111111-1111-1111-1111-111111111111'
const SALE = '22222222-2222-2222-2222-222222222222'
const PRODUCT = '33333333-3333-3333-3333-333333333333'
const DAY = '2026-08-11'
const TS = `${DAY} 12:00:00+00`

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const num = (v: unknown) => Number(v ?? 0)

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
  if (res.status !== 400 && attempt < 6) {
    await sleep(2000 * (attempt + 1))
    return runSql<T>(sql, attempt + 1)
  }
  throw new Error(`SQL failed (${res.status}): ${text.slice(0, 400)}`)
}

const n = (v: number | null | undefined) => (v === null || v === undefined ? 'NULL' : String(v))

/**
 * Читает миграцию, приводя переводы строк к LF: на Windows файл может лежать с
 * CRLF, и тогда разметка для подстановки таблиц перестаёт совпадать.
 */
function readMigration(): string {
  return fs.readFileSync(MIGRATION, 'utf8').split('\r\n').join('\n')
}

interface SaleRow {
  paid_cash?: number | null
  paid_kaspi?: number | null
  paid_halyk?: number | null
  paid_kaspi_transfer?: number | null
}
interface WorkshopRow {
  service_price: number | null
  parts_price: number | null
  prepayment: number
  original_prepayment: number | null
  method: string
}

/** Подставляет выдуманные строки вместо реальных таблиц внутри запроса миграции. */
function buildQuery(sale: SaleRow | null, returnedValue: number, workshop: WorkshopRow[]): string {
  // Нормализуем переводы строк: на Windows файл может лежать с CRLF,
  // и разметка для вырезания ветки/подстановки перестала бы совпадать.
  const sql = readMigration()
  const start = sql.indexOf('RETURN QUERY')
  const end = sql.indexOf('ON true;', start)
  if (start === -1 || end === -1) throw new Error('Не найдено тело запроса в миграции')
  const body = sql.slice(start + 'RETURN QUERY'.length, end + 'ON true'.length)

  const salesRows = sale
    ? `('${SALE}'::uuid, '${BRANCH}'::uuid, 'paid'::text, '${TS}'::timestamptz, `
      + `${n(sale.paid_cash)}::numeric, ${n(sale.paid_kaspi)}::numeric, `
      + `${n(sale.paid_halyk)}::numeric, ${n(sale.paid_kaspi_transfer)}::numeric, `
      + `0::numeric, NULL::timestamptz, NULL::text)`
    : `(NULL::uuid, NULL::uuid, NULL::text, NULL::timestamptz, NULL::numeric, NULL::numeric,`
      + ` NULL::numeric, NULL::numeric, NULL::numeric, NULL::timestamptz, NULL::text)`

  const soRows = workshop.length > 0
    ? workshop.map(o =>
        `('${BRANCH}'::uuid, NULL::uuid, ${o.prepayment}::numeric, NULL::text, NULL::timestamptz, `
        + `'${o.method}'::text, '${TS}'::timestamptz, ${n(o.service_price)}::numeric, `
        + `${n(o.parts_price)}::numeric, ${n(o.original_prepayment)}::numeric, `
        + `NULL::timestamptz, NULL::text, NULL::timestamptz, NULL::text)`
      ).join(',\n      ')
    : `('${BRANCH}'::uuid, NULL::uuid, 0::numeric, NULL::text, NULL::timestamptz, NULL::text,`
      + ` NULL::timestamptz, 0::numeric, 0::numeric, 0::numeric, NULL::timestamptz, NULL::text,`
      + ` NULL::timestamptz, NULL::text)`

  const hasReturn = sale !== null && returnedValue > 0
  const movRows = `('return'::text, '${BRANCH}'::uuid, '${TS}'::timestamptz, 1::numeric, '${PRODUCT}'::uuid, '${SALE}'::uuid)`
  const itemRows = `('${SALE}'::uuid, '${PRODUCT}'::uuid, ${returnedValue}::numeric)`

  // Пустые наборы делаем через WHERE false, чтобы типы колонок сохранились.
  const shadow = `WITH
  sales AS (
    SELECT * FROM (VALUES
      ${salesRows}
    ) AS t(id, branch_id, status, created_at, paid_cash, paid_kaspi, paid_halyk,
           paid_kaspi_transfer, debt_amount, debt_paid_at, debt_payment_method)
    ${sale ? '' : 'WHERE false'}
  ),
  service_orders AS (
    SELECT * FROM (VALUES
      ${soRows}
    ) AS t(created_branch_id, sale_id, prepayment, prepayment_method, prepayment_paid_at,
           remaining_payment_method, remaining_paid_at, service_price, parts_price,
           original_prepayment, prepayment_refunded_at, prepayment_refund_method,
           remaining_refunded_at, remaining_refund_method)
    ${workshop.length > 0 ? '' : 'WHERE false'}
  ),
  orders AS (
    SELECT * FROM (VALUES
      (NULL::uuid, NULL::numeric, NULL::text, NULL::timestamptz, NULL::text)
    ) AS t(branch_id, prepayment_amount, prepayment_method, prepayment_paid_at, status)
    WHERE false
  ),
  stock_movements AS (
    SELECT * FROM (VALUES
      ${movRows}
    ) AS t(type, branch_id, created_at, quantity, product_id, reference_id)
    ${hasReturn ? '' : 'WHERE false'}
  ),
  sale_items AS (
    SELECT * FROM (VALUES
      ${itemRows}
    ) AS t(sale_id, product_id, price)
    ${hasReturn ? '' : 'WHERE false'}
  ),
  expenses AS (
    SELECT * FROM (VALUES
      (NULL::uuid, NULL::date, NULL::numeric, NULL::text)
    ) AS t(branch_id, date, amount, payment_method)
    WHERE false
  ),`

  return body
    .replace(/^\s*WITH\s*$/m, shadow)
    .replace(/\bp_branch_id\b/g, `'${BRANCH}'::uuid`)
    .replace(/\bp_date\b/g, `'${DAY}'::date`)
    .replace(/\bv_from\b/g, `('${DAY} 00:00:00'::timestamp AT TIME ZONE 'UTC')`)
    .replace(/\bv_to\b/g, `('${DAY} 23:59:59'::timestamp AT TIME ZONE 'UTC')`)
}

function frontTotals(sale: SaleRow | null, returnedValue: number, workshop: WorkshopRow[]) {
  const paid = {
    paid_cash: num(sale?.paid_cash), paid_kaspi: num(sale?.paid_kaspi),
    paid_halyk: num(sale?.paid_halyk), paid_kaspi_transfer: num(sale?.paid_kaspi_transfer),
  }
  const hasReturn = sale !== null && returnedValue > 0
  return computeCashTotals({
    sales: sale ? [paid] : [],
    workshopPrepayments: [],
    workshopRemaining: workshop.map(o => ({
      service_price: num(o.service_price), parts_price: num(o.parts_price),
      prepayment: o.prepayment, original_prepayment: o.original_prepayment,
      remaining_payment_method: o.method,
    })),
    debtSettlements: [], preorderPayments: [], prepaymentRefunds: [], remainingRefunds: [],
    returnMovements: hasReturn
      ? [{ quantity: 1, product_id: PRODUCT, reference_id: SALE }] : [],
    returnSaleItems: hasReturn
      ? [{ sale_id: SALE, product_id: PRODUCT, price: returnedValue }] : [],
    returnSales: sale ? [{ id: SALE, ...paid }] : [],
    expenses: [],
  })
}

const CASES: { name: string; sale: SaleRow | null; returned: number; workshop?: WorkshopRow[] }[] = [
  {
    name: 'смешанная оплата: возврат делится пропорционально',
    sale: { paid_cash: 25200, paid_kaspi: 12000 }, returned: 37200,
  },
  {
    name: 'копейки округления не теряются (333/333/334)',
    sale: { paid_cash: 333, paid_kaspi: 333, paid_halyk: 334 }, returned: 1000,
  },
  {
    name: 'продажа с долгом: вычитаем не больше фактически полученного',
    sale: { paid_kaspi: 8000 }, returned: 11000,
  },
  {
    name: 'пустые paid_* не ломают распределение возврата',
    sale: { paid_cash: null, paid_kaspi: 5000, paid_halyk: null }, returned: 5000,
  },
  {
    name: 'возврат по неоплаченной продаже не вычитается ниоткуда',
    sale: { paid_cash: 0 }, returned: 5000,
  },
  {
    // Регрессия: в SQL «пусто + число» даёт пусто, и строка выпадала из суммы
    // целиком, а в JS пусто считается нулём. Расхождение было бы на всю доплату.
    name: 'пустые цены заказа мастерской считаются нулём, а не теряют строку',
    sale: null, returned: 0,
    workshop: [
      { service_price: null, parts_price: 7000, prepayment: 2000, original_prepayment: 2000, method: 'cash' },
      { service_price: 3000, parts_price: null, prepayment: 1000, original_prepayment: null, method: 'kaspi' },
    ],
  },
]

describe.skipIf(!ENABLED)('серверная касса: краевые случаи против фронта', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      await sleep(600) // управляющий API ограничивает частоту
      const workshop = c.workshop ?? []
      const [server] = await runSql(buildQuery(c.sale, c.returned, workshop))
      const front = frontTotals(c.sale, c.returned, workshop)

      expect(num(server.system_cash), 'наличные').toBeCloseTo(front.systemCash, 2)
      expect(num(server.system_kaspi), 'Kaspi QR').toBeCloseTo(front.systemKaspi, 2)
      expect(num(server.system_halyk), 'POST').toBeCloseTo(front.systemHalyk, 2)
      expect(num(server.system_kaspi_transfer), 'перевод').toBeCloseTo(front.systemKaspiTransfer, 2)
      expect(num(server.system_total), 'итого').toBeCloseTo(front.systemTotal, 2)
    }, 60_000)
  }
})

-- Migration: серверный расчёт кассы (compute_cash_session_totals)
-- 2026-08-11
--
-- ЗАЧЕМ:
-- Сейчас системные суммы смены считает БРАУЗЕР и записывает в cash_sessions,
-- а close_cash_session берёт эту запись как есть и замораживает в
-- cash_session_closures. Значит источник истины по деньгам — вкладка менеджера:
-- если она не пересчиталась перед закрытием, в историю уходит неверная цифра
-- (реальный случай: погашение долга 3000 ₸ не попало в кассу «Гум» и замёрзло).
--
-- Эта функция считает те же суммы НА СЕРВЕРЕ из первичных данных. После неё
-- close_cash_session фиксирует серверную цифру, а не присланную браузером.
-- Браузерный расчёт остаётся для показа — он совпадает с серверным (см. тест
-- равенства src/test/cashParity.db.test.ts).
--
-- ЗЕРКАЛО: арифметика повторяет computeCashTotals() из src/services/cashCalc.ts
-- ОДИН В ОДИН, включая порядок карманов, обрезание возврата по фактически
-- полученному и досыл копеек округления в самый крупный карман. Любая правка
-- формулы должна вноситься в ОБА места, иначе тест равенства упадёт.
--
-- ГРАНИЦЫ ДНЯ: как во фронте — [дата 00:00:00 .. дата 23:59:59] по UTC.
-- Это не календарный день Алматы: граница приходится на 05:00 местного, что
-- для магазина с графиком 09:00–20:00 удобнее полуночи (работа за полночь не
-- разрывается на две смены). Специально сохранено, чтобы цифры не поехали.
-- Побочный эффект, унаследованный из фронта: строки в интервале
-- 23:59:59.000001–23:59:59.999999 не попадают ни в один день. Оставлено ради
-- полного совпадения; чинить — отдельной задачей и сразу в обоих местах.
--
-- РАСХОДЫ возвращаются ОТДЕЛЬНЫМИ полями и НЕ входят в system_*. Так и было:
-- наличные расходы вычитает close_cash_session при расчёте расхождения, Kaspi —
-- витрины при показе. Если вложить их в system_cash, расхождение при закрытии
-- посчитает расходы дважды.

-- ============================================================
-- 0. Недостающие колонки «возврат доплаты мастерской»
-- ============================================================
-- НАЙДЕНО ТЕСТОМ РАВЕНСТВА: фронт (CashSessionCard, а с задачи T80 и cashAdmin)
-- запрашивает service_orders.remaining_refunded_at / remaining_refund_method,
-- которых в базе НЕТ. Запрос молча падает, `data` приходит null, ветка всегда
-- считала ноль — то есть «вычет возврата доплаты» никогда не работал, и правка
-- этого пункта в T80 фактически была холостой.
--
-- Колонки добавляются additive: строк со значениями нет, поэтому суммы кассы
-- НЕ меняются (было 0 из-за ошибки запроса — станет 0 из-за отсутствия данных).
-- Зеркалят уже существующую пару prepayment_refunded_at / prepayment_refund_method.
-- Интерфейса, который их проставляет, пока нет — это отдельная задача.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS remaining_refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS remaining_refund_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_orders_remaining_refund_method_check'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_remaining_refund_method_check
      CHECK (
        remaining_refund_method IS NULL
        OR remaining_refund_method IN ('cash', 'kaspi', 'halyk', 'kaspi_transfer')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.service_orders.remaining_refunded_at IS
  'Когда возвращена доплата (остаток) по заказу мастерской; NULL = не возвращалась.';
COMMENT ON COLUMN public.service_orders.remaining_refund_method IS
  'Чем возвращена доплата: cash / kaspi / halyk / kaspi_transfer.';

-- ============================================================
-- 1. Серверный расчёт кассы
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_cash_session_totals(
  p_branch_id uuid,
  p_date date
)
RETURNS TABLE (
  sales_cash            numeric,
  sales_kaspi           numeric,
  sales_halyk           numeric,
  sales_kaspi_transfer  numeric,
  system_cash           numeric,
  system_kaspi          numeric,
  system_halyk          numeric,
  system_kaspi_transfer numeric,
  system_total          numeric,
  expenses_cash         numeric,
  expenses_kaspi        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role   text;
  v_actor_branch uuid;
  v_from         timestamptz;
  v_to           timestamptz;
BEGIN
  -- Права: функция обходит RLS, поэтому проверяем явно (та же модель, что в
  -- settle_sale_debt). Иначе любой сотрудник читал бы выручку чужого филиала.
  SELECT role, branch_id
    INTO v_actor_role, v_actor_branch
  FROM employees
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true)
  LIMIT 1;

  -- auth.uid() пуст при вызове из другой SECURITY DEFINER функции под
  -- service_role (например, из close_cash_session при серверных сценариях) —
  -- такой вызов считаем доверенным.
  IF auth.uid() IS NOT NULL THEN
    IF v_actor_role IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: расчёт кассы доступен только активным сотрудникам';
    END IF;
    IF v_actor_role <> 'admin' AND p_branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'FORBIDDEN: касса другого филиала';
    END IF;
  END IF;

  v_from := (p_date::text || ' 00:00:00')::timestamp AT TIME ZONE 'UTC';
  v_to   := (p_date::text || ' 23:59:59')::timestamp AT TIME ZONE 'UTC';

  RETURN QUERY
  WITH
  -- 1. Продажи за день по способам оплаты.
  sales_agg AS (
    SELECT
      COALESCE(SUM(s.paid_cash), 0)           AS cash,
      COALESCE(SUM(s.paid_kaspi), 0)          AS kaspi,
      COALESCE(SUM(s.paid_halyk), 0)          AS halyk,
      COALESCE(SUM(s.paid_kaspi_transfer), 0) AS kaspi_transfer
    FROM sales s
    WHERE s.branch_id = p_branch_id
      AND s.status IN ('paid', 'refunded', 'partially_refunded')
      AND s.created_at >= v_from
      AND s.created_at <= v_to
  ),

  -- 2. Движения денег со способом оплаты: плюс — приход, минус — возврат.
  --    Один UNION вместо шести отдельных сумм — ровно то же, что делает
  --    income() во фронте.
  pocket_moves AS (
    -- Предоплаты мастерской. ТОЛЬКО заказы без привязанной продажи: заказ,
    -- оформленный внутри продажи, уже посчитан в paid_* самой продажи.
    SELECT so.prepayment_method AS method, so.prepayment::numeric AS amount
    FROM service_orders so
    WHERE so.created_branch_id = p_branch_id
      AND so.sale_id IS NULL
      AND so.prepayment_paid_at IS NOT NULL
      AND so.prepayment_paid_at >= v_from
      AND so.prepayment_paid_at <= v_to
      AND so.prepayment > 0

    UNION ALL
    -- Оплата предзаказа (предоплата или 100%). Продажа под предзаказом не
    -- создаётся, поэтому деньги берём прямо из orders.
    SELECT o.prepayment_method, o.prepayment_amount::numeric
    FROM orders o
    WHERE o.branch_id = p_branch_id
      AND o.prepayment_paid_at IS NOT NULL
      AND o.prepayment_paid_at >= v_from
      AND o.prepayment_paid_at <= v_to
      AND o.prepayment_amount > 0
      AND o.status <> 'cancelled'

    UNION ALL
    -- Доплаты мастерской при выдаче (остаток).
    SELECT so.remaining_payment_method,
           (so.service_price + so.parts_price
             - COALESCE(so.original_prepayment, so.prepayment))::numeric
    FROM service_orders so
    WHERE so.created_branch_id = p_branch_id
      AND so.remaining_paid_at IS NOT NULL
      AND so.remaining_paid_at >= v_from
      AND so.remaining_paid_at <= v_to

    UNION ALL
    -- Погашения долга по товару.
    SELECT s.debt_payment_method, s.debt_amount::numeric
    FROM sales s
    WHERE s.branch_id = p_branch_id
      AND s.debt_paid_at IS NOT NULL
      AND s.debt_paid_at >= v_from
      AND s.debt_paid_at <= v_to

    UNION ALL
    -- Возвраты предоплат мастерской (минус).
    SELECT so.prepayment_refund_method, -COALESCE(so.original_prepayment, 0)::numeric
    FROM service_orders so
    WHERE so.created_branch_id = p_branch_id
      AND so.prepayment_refunded_at IS NOT NULL
      AND so.prepayment_refunded_at >= v_from
      AND so.prepayment_refunded_at <= v_to

    UNION ALL
    -- Возвраты доплат мастерской (минус).
    SELECT so.remaining_refund_method,
           -GREATEST(0, so.service_price + so.parts_price
             - COALESCE(so.original_prepayment, so.prepayment))::numeric
    FROM service_orders so
    WHERE so.created_branch_id = p_branch_id
      AND so.remaining_refunded_at IS NOT NULL
      AND so.remaining_refunded_at >= v_from
      AND so.remaining_refunded_at <= v_to
  ),

  moves_agg AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE method = 'cash'), 0)           AS cash,
      COALESCE(SUM(amount) FILTER (WHERE method = 'kaspi'), 0)          AS kaspi,
      COALESCE(SUM(amount) FILTER (WHERE method = 'halyk'), 0)          AS halyk,
      COALESCE(SUM(amount) FILTER (WHERE method = 'kaspi_transfer'), 0) AS kaspi_transfer
    FROM pocket_moves
  ),

  -- 3. Возвраты товара. Цена берётся из позиции ИСХОДНОЙ продажи.
  --    DISTINCT ON — страховка от дублей позиций по одному товару в продаже
  --    (во фронте при дубле выигрывает последняя запись; здесь берём одну
  --    детерминированно, чтобы JOIN не размножил количество).
  sale_item_prices AS (
    SELECT DISTINCT ON (si.sale_id, si.product_id)
           si.sale_id, si.product_id, si.price
    FROM sale_items si
    WHERE si.sale_id IN (
      SELECT DISTINCT m.reference_id
      FROM stock_movements m
      WHERE m.type = 'return'
        AND m.branch_id = p_branch_id
        AND m.created_at >= v_from
        AND m.created_at <= v_to
        AND m.reference_id IS NOT NULL
    )
    ORDER BY si.sale_id, si.product_id, si.price DESC
  ),

  returned_by_sale AS (
    SELECT m.reference_id AS sale_id,
           SUM(m.quantity * sip.price)::numeric AS returned_value
    FROM stock_movements m
    JOIN sale_item_prices sip
      ON sip.sale_id = m.reference_id AND sip.product_id = m.product_id
    WHERE m.type = 'return'
      AND m.branch_id = p_branch_id
      AND m.created_at >= v_from
      AND m.created_at <= v_to
      AND m.reference_id IS NOT NULL
    GROUP BY m.reference_id
  ),

  -- Возврат вычитается из того кармана, которым платили за продажу.
  -- Смешанная оплата делится пропорционально фактическим paid_*; вычесть
  -- нельзя больше, чем по продаже реально получено (продажа с долгом).
  returns_alloc AS (
    SELECT
      -- Копейки округления досылаем в самый крупный карман — как во фронте,
      -- где берётся ПЕРВЫЙ индекс максимума в порядке нал/Kaspi/POST/перевод.
      SUM(sh.s1 + CASE WHEN r.residual <> 0 AND b.idx = 1 THEN r.residual ELSE 0 END) AS cash,
      SUM(sh.s2 + CASE WHEN r.residual <> 0 AND b.idx = 2 THEN r.residual ELSE 0 END) AS kaspi,
      SUM(sh.s3 + CASE WHEN r.residual <> 0 AND b.idx = 3 THEN r.residual ELSE 0 END) AS halyk,
      SUM(sh.s4 + CASE WHEN r.residual <> 0 AND b.idx = 4 THEN r.residual ELSE 0 END) AS kaspi_transfer
    FROM returned_by_sale rbs
    JOIN sales s ON s.id = rbs.sale_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(s.paid_cash, 0)::numeric           AS p1,
             COALESCE(s.paid_kaspi, 0)::numeric          AS p2,
             COALESCE(s.paid_halyk, 0)::numeric          AS p3,
             COALESCE(s.paid_kaspi_transfer, 0)::numeric AS p4
    ) p
    CROSS JOIN LATERAL (SELECT p.p1 + p.p2 + p.p3 + p.p4 AS paid_sum) ps
    CROSS JOIN LATERAL (SELECT LEAST(rbs.returned_value, ps.paid_sum) AS amt) a
    CROSS JOIN LATERAL (
      SELECT round(a.amt * p.p1 / ps.paid_sum, 2) AS s1,
             round(a.amt * p.p2 / ps.paid_sum, 2) AS s2,
             round(a.amt * p.p3 / ps.paid_sum, 2) AS s3,
             round(a.amt * p.p4 / ps.paid_sum, 2) AS s4
    ) sh
    CROSS JOIN LATERAL (
      SELECT round(a.amt - (sh.s1 + sh.s2 + sh.s3 + sh.s4), 2) AS residual
    ) r
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN p.p1 >= p.p2 AND p.p1 >= p.p3 AND p.p1 >= p.p4 THEN 1
               WHEN p.p2 >= p.p3 AND p.p2 >= p.p4 THEN 2
               WHEN p.p3 >= p.p4 THEN 3
               ELSE 4
             END AS idx
    ) b
    WHERE ps.paid_sum > 0
      AND rbs.returned_value > 0
  ),

  -- 4. Расходы за день. НЕ входят в system_* — см. шапку файла.
  expenses_agg AS (
    SELECT
      COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'cash'), 0)  AS cash,
      COALESCE(SUM(e.amount) FILTER (WHERE e.payment_method = 'kaspi'), 0) AS kaspi
    FROM expenses e
    WHERE e.branch_id = p_branch_id
      AND e.date = p_date
  )

  -- Псевдонимы обязательны: без них несколько колонок называются одинаково
  -- (cash у продаж и у расходов), и любой потребитель, читающий строку как
  -- объект по именам, схлопнет дубли.
  SELECT
    sa.cash           AS sales_cash,
    sa.kaspi          AS sales_kaspi,
    sa.halyk          AS sales_halyk,
    sa.kaspi_transfer AS sales_kaspi_transfer,
    (sa.cash           + ma.cash           - COALESCE(ra.cash, 0))           AS system_cash,
    (sa.kaspi          + ma.kaspi          - COALESCE(ra.kaspi, 0))          AS system_kaspi,
    (sa.halyk          + ma.halyk          - COALESCE(ra.halyk, 0))          AS system_halyk,
    (sa.kaspi_transfer + ma.kaspi_transfer - COALESCE(ra.kaspi_transfer, 0)) AS system_kaspi_transfer,
    (
      (sa.cash           + ma.cash           - COALESCE(ra.cash, 0))
      + (sa.kaspi          + ma.kaspi          - COALESCE(ra.kaspi, 0))
      + (sa.halyk          + ma.halyk          - COALESCE(ra.halyk, 0))
      + (sa.kaspi_transfer + ma.kaspi_transfer - COALESCE(ra.kaspi_transfer, 0))
    ) AS system_total,
    ea.cash  AS expenses_cash,
    ea.kaspi AS expenses_kaspi
  FROM sales_agg sa
  CROSS JOIN moves_agg ma
  CROSS JOIN expenses_agg ea
  LEFT JOIN returns_alloc ra ON true;
END;
$$;

COMMENT ON FUNCTION public.compute_cash_session_totals(uuid, date) IS
  'Авторитетный серверный расчёт системных сумм кассы за день. Зеркалит computeCashTotals() из src/services/cashCalc.ts. Расходы возвращаются отдельно и НЕ входят в system_*.';

REVOKE ALL ON FUNCTION public.compute_cash_session_totals(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_cash_session_totals(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_cash_session_totals(uuid, date) TO authenticated;

-- ============================================================
-- close_cash_session: фиксируем СЕРВЕРНУЮ сумму
-- ============================================================
-- Отличие от прежней версии ровно одно: суммы берутся из
-- compute_cash_session_totals, а не из строки cash_sessions (куда их писал
-- браузер). Строка смены тоже приводится к серверным цифрам — иначе после
-- закрытия карточка показывала бы одно, а история другое.
-- Логика расхождения и watchlist_events не меняется.

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id uuid,
  p_actual_cash numeric,
  p_employee_id uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session       cash_sessions%ROWTYPE;
  v_totals        RECORD;
  v_cash_expenses NUMERIC;
  v_expected_cash NUMERIC;
  v_discrepancy   NUMERIC;
BEGIN
  SELECT * INTO v_session FROM cash_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Сессия не найдена'; END IF;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'Касса уже закрыта'; END IF;

  SELECT * INTO v_totals
  FROM compute_cash_session_totals(v_session.branch_id, v_session.date);

  v_cash_expenses := COALESCE(v_totals.expenses_cash, 0);
  v_expected_cash := v_totals.system_cash - v_cash_expenses;
  v_discrepancy   := v_expected_cash - p_actual_cash;

  UPDATE cash_sessions SET
    system_cash      = v_totals.system_cash,
    system_kaspi     = v_totals.system_kaspi,
    system_total     = v_totals.system_total,
    actual_cash      = p_actual_cash,
    cash_discrepancy = v_discrepancy,
    status           = 'closed',
    notes            = p_notes,
    closed_at        = NOW()
  WHERE id = p_session_id;

  INSERT INTO cash_session_closures (
    session_id, branch_id, closed_at, system_cash, system_kaspi, system_total,
    actual_cash, cash_discrepancy, notes, closed_by
  ) VALUES (
    p_session_id, v_session.branch_id, NOW(),
    v_totals.system_cash, v_totals.system_kaspi, v_totals.system_total,
    p_actual_cash, v_discrepancy, p_notes, p_employee_id
  );

  IF ABS(v_discrepancy) > 0 THEN
    INSERT INTO watchlist_events (
      type, branch_id, employee_id, quantity, amount, notes, extra
    ) VALUES (
      'cash_discrepancy',
      v_session.branch_id,
      p_employee_id,
      1,
      ABS(v_discrepancy),
      'Кассовое расхождение: ожидалось ' || v_expected_cash ||
        ' ₸ (продажи ' || v_totals.system_cash ||
        ' - расходы ' || v_cash_expenses ||
        '), сдано ' || p_actual_cash || ' ₸',
      jsonb_build_object(
        'system_cash',   v_totals.system_cash,
        'cash_expenses', v_cash_expenses,
        'expected_cash', v_expected_cash,
        'actual_cash',   p_actual_cash,
        'discrepancy',   v_discrepancy,
        'date',          v_session.date,
        'source',        'server'
      )
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.close_cash_session(uuid, numeric, uuid, text) IS
  'Закрытие смены. Системные суммы берутся из compute_cash_session_totals (сервер), а не из того, что записал браузер.';

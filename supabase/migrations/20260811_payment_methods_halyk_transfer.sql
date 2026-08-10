-- Migration: POST (halyk) и Kaspi-перевод для погашения долга и доплаты мастерской
-- 2026-08-11
--
-- Продажа умеет 4 способа оплаты (cash / kaspi_qr / halyk / kaspi_transfer), а
-- погашение долга по товару и доплата мастерской при выдаче — только 2
-- (наличные / Kaspi QR). Если клиент закрывает долг через POST-терминал или
-- переводом, записать это было нечем: и интерфейс, и CHECK-констрейнт не
-- принимали такое значение.
--
-- Расширение ТОЛЬКО добавляет допустимые значения — существующие строки под
-- новый CHECK подходят все без исключения, переписывать данные не требуется.
--
-- Названия способов намеренно совпадают с колонками sales.paid_*:
--   cash -> наличные, kaspi -> Kaspi QR, halyk -> POST, kaspi_transfer -> перевод.

-- ============================================================
-- 1. Погашение долга по продаже
-- ============================================================

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_debt_payment_method_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_debt_payment_method_check
  CHECK (
    debt_payment_method IS NULL
    OR debt_payment_method IN ('cash', 'kaspi', 'halyk', 'kaspi_transfer')
  );

COMMENT ON COLUMN public.sales.debt_payment_method IS
  'Чем погасили долг: cash / kaspi (QR) / halyk (POST) / kaspi_transfer (перевод). Совпадает с раскладкой sales.paid_*.';

-- ============================================================
-- 2. Доплата мастерской при выдаче
-- ============================================================
-- Прежний CHECK был без явного IS NULL. NULL и так проходил (сравнение с NULL
-- даёт NULL, а не false), поведение не меняется — просто записано явно.

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_remaining_payment_method_check;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_remaining_payment_method_check
  CHECK (
    remaining_payment_method IS NULL
    OR remaining_payment_method IN ('cash', 'kaspi', 'halyk', 'kaspi_transfer')
  );

COMMENT ON COLUMN public.service_orders.remaining_payment_method IS
  'Чем оплачен остаток при выдаче: cash / kaspi (QR) / halyk (POST) / kaspi_transfer (перевод).';

-- ============================================================
-- 2б. Предоплата/полная оплата предзаказа
-- ============================================================
-- Деньги предзаказа теперь учитываются в кассе (раньше терялись), поэтому
-- способ оплаты у него тоже должен покрывать все 4 варианта — иначе предзаказ,
-- оплаченный через POST, записать нечем.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_prepayment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_prepayment_method_check
  CHECK (
    prepayment_method IS NULL
    OR prepayment_method IN ('cash', 'kaspi', 'halyk', 'kaspi_transfer')
  );

COMMENT ON COLUMN public.orders.prepayment_method IS
  'Чем оплачен предзаказ: cash / kaspi (QR) / halyk (POST) / kaspi_transfer (перевод).';

COMMENT ON COLUMN public.orders.prepayment_paid_at IS
  'Когда получены деньги по предзаказу. По этой дате касса относит сумму к нужному дню; NULL = не оплачен.';

-- ============================================================
-- 3. settle_sale_debt — та же валидация внутри функции
-- ============================================================
-- Функция проверяет способ оплаты сама (см. 20260810_settle_sale_debt_rpc.sql),
-- поэтому без её обновления новые способы упирались бы в INVALID_METHOD.
-- Остальное тело — без изменений, включая проверки прав и защиту от гонки.

CREATE OR REPLACE FUNCTION public.settle_sale_debt(p_sale_id uuid, p_method text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role   text;
  v_actor_branch uuid;
  v_sale_branch  uuid;
  v_debt         numeric;
  v_debt_paid_at timestamptz;
BEGIN
  IF p_method IS NULL OR p_method NOT IN ('cash', 'kaspi', 'halyk', 'kaspi_transfer') THEN
    RAISE EXCEPTION 'INVALID_METHOD: недопустимый способ оплаты (получено: %)', p_method;
  END IF;

  SELECT role, branch_id
    INTO v_actor_role, v_actor_branch
  FROM employees
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true)
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: действие доступно только активным сотрудникам';
  END IF;

  SELECT branch_id, debt_amount, debt_paid_at
    INTO v_sale_branch, v_debt, v_debt_paid_at
  FROM sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: продажа % не найдена', p_sale_id;
  END IF;

  IF v_actor_role <> 'admin' AND v_sale_branch IS DISTINCT FROM v_actor_branch THEN
    RAISE EXCEPTION 'FORBIDDEN: продажа относится к другому филиалу';
  END IF;

  IF COALESCE(v_debt, 0) <= 0 THEN
    RAISE EXCEPTION 'NO_DEBT: по продаже % нет долга', p_sale_id;
  END IF;

  IF v_debt_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_SETTLED: долг уже погашен';
  END IF;

  UPDATE sales
     SET debt_paid_at        = now(),
         debt_payment_method = p_method
   WHERE id = p_sale_id
     AND debt_paid_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_SETTLED: долг уже погашен';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_sale_debt(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_sale_debt(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.settle_sale_debt(uuid, text) TO authenticated;

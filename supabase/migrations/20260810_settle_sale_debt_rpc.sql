-- Migration: settle_sale_debt() — погашение долга по продаже через RPC
-- 2026-08-10
--
-- ПРОБЛЕМА, которую чиним:
-- RLS-политика employees_update_sales разрешает не-админу UPDATE строки sales
-- только при status = 'pending'. Продажа с частичной оплатой создаётся сразу
-- со status = 'paid' (долг живёт в debt_amount, а не в status — см. миграцию
-- 20260805_sales_debt_amount.sql). В результате менеджер физически не мог
-- погасить долг: UPDATE задевал 0 строк, и .single() на клиенте превращал это
-- в ошибку "нет прав / уже погашен".
--
-- РЕШЕНИЕ: SECURITY DEFINER функция — тот же приём, что уже используется для
-- возврата (update_sale_status_for_return). Функция обходит RLS, поэтому все
-- проверки прав сделаны ЯВНО внутри неё.
--
-- ВАЖНО: существующие RLS-политики на sales НЕ меняем. Расширять
-- employees_update_sales на status='paid' было бы дырой — менеджер получил бы
-- право править у оплаченной продажи любое поле, включая суммы. Здесь же
-- меняются ровно две колонки: debt_paid_at и debt_payment_method.
--
-- В отличие от update_sale_status_for_return (там проверок роли/филиала нет
-- вообще) эта функция проверяет: вызывающий — активный сотрудник, и если он не
-- admin, то филиал продажи должен совпадать с его филиалом.

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
  -- Способ оплаты — тот же набор из двух вариантов, что и в CHECK-констрейнте
  -- колонки debt_payment_method.
  IF p_method IS NULL OR p_method NOT IN ('cash', 'kaspi') THEN
    RAISE EXCEPTION 'INVALID_METHOD: способ оплаты должен быть cash или kaspi (получено: %)', p_method;
  END IF;

  -- Кто вызывает. is_active NULL трактуем как "активен": колонка nullable, и
  -- деактивация проставляет явный false (на момент миграции у всех 12 строк
  -- employees is_active = true).
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

  -- Не-админ работает только со своим филиалом (та же модель, что в
  -- SELECT-политике employees_select_sales).
  IF v_actor_role <> 'admin' AND v_sale_branch IS DISTINCT FROM v_actor_branch THEN
    RAISE EXCEPTION 'FORBIDDEN: продажа относится к другому филиалу';
  END IF;

  IF COALESCE(v_debt, 0) <= 0 THEN
    RAISE EXCEPTION 'NO_DEBT: по продаже % нет долга', p_sale_id;
  END IF;

  IF v_debt_paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_SETTLED: долг уже погашен';
  END IF;

  -- debt_amount и paid_cash/paid_kaspi НЕ трогаем — исторические суммы на
  -- момент продажи остаются как есть, иначе кассовый отчёт задвоил бы сумму
  -- при погашении в день продажи (см. комментарий у settleSaleDebt в
  -- src/services/inventory.ts).
  --
  -- AND debt_paid_at IS NULL — атомарная защита от гонки: если долг успели
  -- погасить между проверкой выше и этим UPDATE, апдейт задевает 0 строк.
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

COMMENT ON FUNCTION public.settle_sale_debt(uuid, text) IS
  'Погашение долга по продаже (debt_paid_at/debt_payment_method). SECURITY DEFINER — обходит RLS employees_update_sales, которая не пускает не-админа к status=''paid''. Права проверяются внутри: активный сотрудник, не-админ только свой филиал.';

-- Вызов только для залогиненных пользователей; анонимным — запрещено.
REVOKE ALL ON FUNCTION public.settle_sale_debt(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_sale_debt(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.settle_sale_debt(uuid, text) TO authenticated;

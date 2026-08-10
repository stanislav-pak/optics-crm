-- Migration: проверка прав в update_sale_status_for_return (дыра из T75)
-- 2026-08-10
--
-- ПРОБЛЕМА:
-- update_sale_status_for_return — SECURITY DEFINER, т.е. обходит RLS, но внутри
-- проверяла только допустимость статуса. Ни роли, ни филиала, ни «активный
-- сотрудник». Плюс EXECUTE был выдан PUBLIC и anon. То есть перевести любую
-- продажу (в т.ч. чужого филиала) в refunded/partially_refunded мог кто угодно
-- прямым вызовом RPC — включая неаутентифицированного пользователя с одним лишь
-- публичным anon-ключом, мимо интерфейса.
--
-- РЕШЕНИЕ: guard в начало функции по той же модели, что в settle_sale_debt
-- (миграция 20260810_settle_sale_debt_rpc.sql). Бизнес-логика возврата ниже
-- guard'а НЕ изменена ни на строку.
--
-- ПОЧЕМУ GUARD НИКОГО ЛЕГИТИМНОГО НЕ ЗАБЛОКИРУЕТ (проверено по бою перед
-- применением — учли урок с погашением долга, где RLS молча ломала штатный
-- сценарий):
--   * все 6 возвратов за историю — менеджер в своём же филиале, кросс-филиальных
--     0, возвратов без известного сотрудника 0;
--   * продажи есть только в «Абая 34» (59) и «Гум» (47); у склада и мастерских
--     продаж 0 — т.е. «складской» менеджер (единственное расширение прав в UI)
--     возвраты не делает в принципе, ему нечего возвращать;
--   * пользователей с ролью branch_admin в базе нет вообще: только admin (2) и
--     manager (12);
--   * SELECT-политика employees_select_sales и так пускает не-админа только к
--     своему филиалу — чужую продажу он не может даже загрузить, чтобы начать
--     возврат. Guard лишь повторяет это правило на стороне записи;
--   * вызывающий во всём коде один — createReturn() из ReturnModal, из браузера
--     под сессией сотрудника. Бэкенд/n8n эту функцию не зовут (проверено).

CREATE OR REPLACE FUNCTION public.update_sale_status_for_return(p_sale_id uuid, p_new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role   text;
  v_actor_branch uuid;
  v_sale_branch  uuid;
BEGIN
  -- ===== GUARD (добавлен 2026-08-10, T75) =====
  -- is_active NULL трактуем как «активен»: колонка nullable, деактивация ставит
  -- явный false (на момент миграции у всех 12 строк employees is_active = true).
  SELECT role, branch_id
    INTO v_actor_role, v_actor_branch
  FROM employees
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true)
  LIMIT 1;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: возврат доступен только активным сотрудникам';
  END IF;

  SELECT branch_id INTO v_sale_branch FROM sales WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: продажа % не найдена', p_sale_id;
  END IF;

  -- Не-админ — только свой филиал (та же модель, что в employees_select_sales).
  IF v_actor_role <> 'admin' AND v_sale_branch IS DISTINCT FROM v_actor_branch THEN
    RAISE EXCEPTION 'FORBIDDEN: продажа относится к другому филиалу';
  END IF;
  -- ===== /GUARD =====

  -- Ниже — исходная логика возврата, без изменений.
  IF p_new_status NOT IN ('refunded', 'partially_refunded') THEN
    RAISE EXCEPTION 'Invalid status for return: %. Only refunded or partially_refunded allowed.', p_new_status;
  END IF;

  UPDATE sales
  SET status = p_new_status
  WHERE id = p_sale_id
    AND status IN ('paid', 'partially_refunded');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found or not in updatable status', p_sale_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_sale_status_for_return(uuid, text) IS
  'Перевод продажи в refunded/partially_refunded при возврате. SECURITY DEFINER — обходит RLS, поэтому права проверяются внутри: активный сотрудник, не-админ только свой филиал (добавлено 2026-08-10, T75).';

-- Закрываем прямой вызов для анонимов: до этой миграции EXECUTE был у PUBLIC и
-- anon. Штатный вызывающий — залогиненный сотрудник (authenticated).
REVOKE ALL ON FUNCTION public.update_sale_status_for_return(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_sale_status_for_return(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_sale_status_for_return(uuid, text) TO authenticated;

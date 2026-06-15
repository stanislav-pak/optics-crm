-- ============================================================
-- Migration: fix close_cash_session RPC
-- 2026-06-16
--
-- Problem: two overloaded versions existed:
--   v1 (session_id, actual_cash, notes, employee_id) — subtracted expenses ✓
--   v2 (session_id, actual_cash, employee_id, notes) — did NOT subtract expenses ✗
--
-- The JS call used positional order (employee_id 3rd, notes 4th), so v2 was
-- being invoked. This caused the stored cash_discrepancy to differ from the
-- UI preview which correctly subtracted cashExpenses.
--
-- Fix: drop both overloads, keep a single correct version with the parameter
-- order matching the JS call and proper expense subtraction.
-- ============================================================

DROP FUNCTION IF EXISTS public.close_cash_session(uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.close_cash_session(uuid, numeric, uuid, text);

CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id  uuid,
  p_actual_cash numeric,
  p_employee_id uuid,
  p_notes       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session       cash_sessions%ROWTYPE;
  v_cash_expenses NUMERIC;
  v_expected_cash NUMERIC;
  v_discrepancy   NUMERIC;
BEGIN
  SELECT * INTO v_session FROM cash_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Сессия не найдена'; END IF;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'Касса уже закрыта'; END IF;

  -- Наличные расходы за этот день в этом филиале
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_expenses
  FROM expenses
  WHERE branch_id      = v_session.branch_id
    AND date           = v_session.date
    AND payment_method = 'cash';

  -- Ожидаемый остаток = доходы наличными - расходы наличными
  v_expected_cash := v_session.system_cash - v_cash_expenses;
  v_discrepancy   := v_expected_cash - p_actual_cash;

  UPDATE cash_sessions SET
    actual_cash      = p_actual_cash,
    cash_discrepancy = v_discrepancy,
    status           = 'closed',
    notes            = p_notes,
    closed_at        = NOW()
  WHERE id = p_session_id;

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
        ' ₸ (продажи ' || v_session.system_cash ||
        ' - расходы ' || v_cash_expenses ||
        '), сдано ' || p_actual_cash || ' ₸',
      jsonb_build_object(
        'system_cash',   v_session.system_cash,
        'cash_expenses', v_cash_expenses,
        'expected_cash', v_expected_cash,
        'actual_cash',   p_actual_cash,
        'discrepancy',   v_discrepancy,
        'date',          v_session.date
      )
    );
  END IF;
END;
$$;

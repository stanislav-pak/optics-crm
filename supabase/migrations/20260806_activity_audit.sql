-- Migration: activity_audit — general CRUD audit log, branch-scoped
-- 2026-08-06
--
-- Не путать с существующими:
--   - activity_log     — CRM/chat-активность менеджеров (сообщения, задачи, этапы)
--   - watchlist_events — 6 типов "рискованных" событий (списание/возврат/скидка>10%/
--                        ниже себестоимости/расхождение перемещения/расхождение кассы),
--                        со своим workflow "просмотрено/нет"
--
-- activity_audit покрывает обычный CRUD (create/update/delete) на "шапках" ключевых
-- сущностей — НЕ построчно (sale_items/stock_movements/revision_items намеренно не
-- аудируются здесь: это уже сами по себе таблицы-журналы движений/позиций).
--
-- Источник записей — ТОЛЬКО триггеры Postgres (ловят изменения и мимо интерфейса).
-- Прямой INSERT с клиента запрещён RLS; функция триггера SECURITY DEFINER обходит RLS
-- при записи.

-- ============================================================
-- Таблица
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_audit (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  actor_employee_id  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_role         text,
  action             text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity_type        text NOT NULL,
  entity_id          uuid NOT NULL,
  branch_id          uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  old_data           jsonb,
  new_data           jsonb,
  source             text NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'system'))
);

COMMENT ON TABLE public.activity_audit IS 'Общий журнал действий (create/update/delete) на ключевых сущностях, разрез по branch_id. Пишется только триггерами.';
COMMENT ON COLUMN public.activity_audit.actor_employee_id IS 'NULL = действие выполнено вне пользовательской сессии (service-role/RPC) — см. source=system.';
COMMENT ON COLUMN public.activity_audit.actor_role IS 'Снапшот роли актёра на момент действия (роль могла измениться позже).';
COMMENT ON COLUMN public.activity_audit.branch_id IS 'Филиал сущности; для branches — сама сущность; если у сущности нет branch_id — филиал актёра.';
COMMENT ON COLUMN public.activity_audit.old_data IS 'row_to_json(OLD) — NULL при create.';
COMMENT ON COLUMN public.activity_audit.new_data IS 'row_to_json(NEW) — NULL при delete.';

CREATE INDEX IF NOT EXISTS idx_activity_audit_branch_created
  ON public.activity_audit (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_audit_entity_created
  ON public.activity_audit (entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_audit_actor
  ON public.activity_audit (actor_employee_id);

-- ============================================================
-- RLS: читать может только admin; прямая запись с клиента запрещена —
-- пишет только SECURITY DEFINER функция триггера (владелец функции обходит RLS).
-- ============================================================

ALTER TABLE public.activity_audit ENABLE ROW LEVEL SECURITY;

-- Postgres не поддерживает "CREATE POLICY IF NOT EXISTS" — без DROP повторное
-- применение файла упадёт на "policy already exists" (миграция не идемпотентна).
DROP POLICY IF EXISTS admin_select_activity_audit ON public.activity_audit;
CREATE POLICY admin_select_activity_audit ON public.activity_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Явно НЕ создаём политики INSERT/UPDATE/DELETE для authenticated/anon —
-- при включённом RLS без соответствующей policy эти операции с клиента
-- отклоняются по умолчанию.

-- ============================================================
-- Функция триггера
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_activity_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_employee_id uuid;
  v_actor_role        text;
  v_actor_branch_id   uuid;
  v_action            text;
  v_entity_id         uuid;
  v_branch_id         uuid;
  v_old               jsonb;
  v_new                jsonb;
BEGIN
  -- "Кто": сопоставляем текущего auth-пользователя с employees.
  -- Пусто (service-role/RPC без пользовательской JWT-сессии) → actor NULL, source='system'.
  SELECT id, role, branch_id INTO v_actor_employee_id, v_actor_role, v_actor_branch_id
  FROM public.employees
  WHERE user_id = auth.uid();

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_new := to_jsonb(NEW);
    v_old := NULL;
    v_entity_id := (v_new->>'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_entity_id := (v_new->>'id')::uuid;
  ELSE -- DELETE
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_entity_id := (v_old->>'id')::uuid;
  END IF;

  -- branch_id: из самой строки (колонка есть у всех аудируемых таблиц, кроме branches);
  -- для branches — сама сущность и есть филиал; иначе fallback — филиал актёра.
  v_branch_id := COALESCE(
    (v_new->>'branch_id')::uuid,
    (v_old->>'branch_id')::uuid,
    CASE WHEN TG_TABLE_NAME = 'branches' THEN v_entity_id ELSE NULL END,
    v_actor_branch_id
  );

  INSERT INTO public.activity_audit (
    actor_employee_id, actor_role, action, entity_type, entity_id,
    branch_id, old_data, new_data, source
  ) VALUES (
    v_actor_employee_id, v_actor_role, v_action, TG_TABLE_NAME, v_entity_id,
    v_branch_id, v_old, v_new,
    CASE WHEN v_actor_employee_id IS NULL THEN 'system' ELSE 'app' END
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- КРИТИЧНО: сбой аудита не должен ронять основную операцию (продажу, правку
  -- товара и т.д.). См. проверку устойчивости в конце файла.
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.log_activity_audit() IS 'Общий триггер аудита для activity_audit. Ошибки внутри проглатываются (EXCEPTION WHEN OTHERS) — аудит не должен блокировать основную операцию.';

-- ============================================================
-- Триггеры на 9 таблицах (уровень "шапки" — не построчно)
-- ============================================================

DROP TRIGGER IF EXISTS trg_activity_audit ON public.products;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.sales;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.employees;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.branches;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.stock_requests;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.stock_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.expenses;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.clients;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.service_orders;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

DROP TRIGGER IF EXISTS trg_activity_audit ON public.revisions;
CREATE TRIGGER trg_activity_audit AFTER INSERT OR UPDATE OR DELETE ON public.revisions
  FOR EACH ROW EXECUTE FUNCTION public.log_activity_audit();

-- ============================================================
-- Проверка устойчивости (ВЫПОЛНИТЬ ВРУЧНУЮ, ПО ЖЕЛАНИЮ, после применения миграции) —
-- убеждаемся, что сломанная запись в activity_audit НЕ ломает основную операцию.
-- Раскомментировать и выполнить построчно, затем откатить последний шаг.
-- ============================================================

-- 1. Искусственно ломаем вставку в activity_audit:
-- ALTER TABLE public.activity_audit RENAME COLUMN entity_type TO entity_type_tmp;
--
-- 2. Выполняем обычную операцию на аудируемой таблице (подставить реальный id):
-- UPDATE public.products SET updated_at = now() WHERE id = '<любой существующий id>';
-- -- либо любой UPDATE/INSERT из приложения (например, оформить тестовую продажу)
--
-- 3. Убеждаемся, что операция прошла без ошибки — UPDATE вернул success,
--    строка products реально обновилась. Строка в activity_audit при этом
--    НЕ появится (это ожидаемо — сама вставка сломана).
--
-- 4. Возвращаем как было:
-- ALTER TABLE public.activity_audit RENAME COLUMN entity_type_tmp TO entity_type;

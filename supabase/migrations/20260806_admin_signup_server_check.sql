-- Migration: admin_signup_server_check — код руководителя проверяется на сервере
-- 2026-08-06
--
-- Проблема: раньше код руководителя сравнивался НА КЛИЕНТЕ
-- (SignupForm.tsx: `adminCode === import.meta.env.VITE_ADMIN_CODE`).
-- VITE_-переменные попадают в JS-бандл и видны любому через devtools/просмотр
-- исходников — код руководителя можно было вытащить из бандла и
-- зарегистрироваться администратором.
--
-- Решение: код (точнее его хеш) хранится в таблице app_secrets, доступной
-- ТОЛЬКО владельцу функции (RLS без единой policy => для anon/authenticated
-- доступ закрыт полностью, включая через PostgREST). Сравнение — внутри
-- SECURITY DEFINER функции register_employee, которая берёт auth.uid() из
-- сессии и решает роль сама. Клиент больше не решает, admin он или нет —
-- только сервер, по результату RPC.

-- ============================================================
-- 0. pgcrypto — для хранения кода как хеша, а не в открытом виде
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 1. Таблица app_secrets — общее хранилище серверных секретов
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key         text PRIMARY KEY,
  value_hash  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_secrets IS 'Серверные секреты (хеши). Доступ — только SECURITY DEFINER функциям (владелец обходит RLS). Никаких policy не создаём — для anon/authenticated доступ закрыт по умолчанию.';

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Явно закрываем табличные права от anon/authenticated (страховка сверх RLS —
-- в некоторых Supabase-проектах public-схема по умолчанию грантится этим ролям).
REVOKE ALL ON public.app_secrets FROM anon, authenticated;

-- Policy НЕ создаём намеренно — RLS включён, policy нет => 0 доступа с клиента
-- ни на SELECT, ни на INSERT/UPDATE/DELETE. Читает/пишет только владелец
-- таблицы (postgres/supabase_admin) — то есть SECURITY DEFINER функции ниже.

-- ============================================================
-- 2. Код руководителя — ВЫПОЛНИТЬ ВРУЧНУЮ ОТДЕЛЬНО, НЕ КОММИТИТЬ С РЕАЛЬНЫМ
--    ЗНАЧЕНИЕМ В GIT. Пример (заменить '<КОД>' на реальный код руководителя):
-- ============================================================
--
-- INSERT INTO public.app_secrets (key, value_hash)
-- VALUES ('admin_signup_code', extensions.crypt('<КОД>', extensions.gen_salt('bf')))
-- ON CONFLICT (key) DO UPDATE SET value_hash = excluded.value_hash, updated_at = now();
--
-- Сменить код в будущем — тот же INSERT ... ON CONFLICT с новым значением.

-- ============================================================
-- 3. RPC register_employee — единственный способ создать строку employees
--    при регистрации. Решает роль сама, по коду руководителя.
-- ============================================================

CREATE OR REPLACE FUNCTION public.register_employee(
  p_branch_id  uuid,
  p_name       text,
  p_email      text,
  p_admin_code text DEFAULT NULL
)
RETURNS TABLE (employee_id uuid, role text, is_active boolean, branch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  -- %TYPE вместо text: если role в employees — enum (а не text/check-constraint),
  -- присвоение строкового литерала переменной этого типа кастуется штатно;
  -- прямая вставка text-переменной в enum-колонку иначе может упасть с ошибкой типа.
  v_role       public.employees.role%TYPE := 'manager';
  v_is_active  boolean := false;
  v_code_hash  text;
  v_branch_id  uuid := p_branch_id;
  v_employee_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.employees WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'employee_already_exists';
  END IF;

  -- Код руководителя опционален (как и раньше — поле "необязательно").
  -- Неверный/пустой код НЕ считается ошибкой регистрации — просто роль
  -- остаётся manager, как и было в прежней клиентской логике
  -- (`isAdmin = adminCode === ADMIN_CODE`, false → обычная регистрация).
  IF p_admin_code IS NOT NULL AND length(p_admin_code) > 0 THEN
    SELECT value_hash INTO v_code_hash
    FROM public.app_secrets
    WHERE key = 'admin_signup_code';

    IF v_code_hash IS NOT NULL AND extensions.crypt(p_admin_code, v_code_hash) = v_code_hash THEN
      v_role := 'admin';
      v_is_active := true;

      -- Как и раньше: администратор всегда попадает в филиал "Склад",
      -- независимо от того, что было выбрано в форме.
      SELECT id INTO v_branch_id FROM public.branches WHERE name = 'Склад' LIMIT 1;
      IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'warehouse_branch_not_found';
      END IF;
    END IF;
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required';
  END IF;

  INSERT INTO public.employees (user_id, branch_id, name, email, role, is_active)
  VALUES (v_user_id, v_branch_id, p_name, p_email, v_role, v_is_active)
  RETURNING id INTO v_employee_id;

  -- ::text явно — RETURNS TABLE объявляет role как text; если employees.role
  -- в реальной БД enum (не text/check-constraint), v_role здесь enum-типа
  -- (см. %TYPE выше) и без явного каста в text вернуть его в этот столбец нельзя.
  RETURN QUERY SELECT v_employee_id, v_role::text, v_is_active, v_branch_id;
END;
$$;

COMMENT ON FUNCTION public.register_employee(uuid, text, text, text) IS 'Единая точка регистрации сотрудника. Сама решает роль (admin/manager) по коду руководителя — код сверяется здесь, внутри SECURITY DEFINER, никогда не покидает сервер.';

REVOKE ALL ON FUNCTION public.register_employee(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_employee(uuid, text, text, text) TO authenticated;

-- ============================================================
-- 4. Единственный путь появления новой строки в employees — эта RPC.
--    В коде фронтенда (проверено grep'ом по src/) нигде больше нет
--    прямого `.from('employees').insert(...)` — раньше он был только в
--    SignupForm.tsx, теперь заменён на вызов RPC. Поэтому забираем у
--    authenticated право на прямой INSERT в employees через REST —
--    без этого любой пользователь мог бы сделать
--    `supabase.from('employees').insert({..., role: 'admin', is_active: true})`
--    напрямую, в обход RPC и кода руководителя вообще, независимо от того,
--    что решает register_employee. RPC (SECURITY DEFINER) продолжит
--    работать — она обходит RLS/GRANT как владелец таблицы.
--
--    SELECT/UPDATE на employees НЕ трогаем — эта миграция только про INSERT.
-- ============================================================

REVOKE INSERT ON public.employees FROM authenticated;

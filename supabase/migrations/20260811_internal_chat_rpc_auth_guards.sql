-- ============================================================
-- T83. Внутренние чаты: проверки прав ВНУТРИ RPC-функций
-- Дата: 2026-08-11
-- Продолжение 20260811_internal_chat_rls_privacy.sql (раздел 8 «ОСТАЮЩАЯСЯ ДЫРА»)
--
-- Тела всех функций ниже выгружены с живой базы toxspgdkvxmpsvtecesy
-- 2026-08-11 через pg_get_functiondef(). Каждая функция здесь — СТРОГИЙ СУПЕРСЕТ:
-- прежнее тело слово в слово плюс проверки прав в начале. Ни один SELECT/INSERT
-- /UPDATE прежней логики не переписан.
--
-- ОТКАТ: точный слепок прежних тел лежит рядом, в
--   supabase/migrations/rollback/20260811_internal_chat_rpc_bodies_before.sql
-- Тела функций в этом проекте живут только в базе, в git их нет, поэтому без
-- такого файла вернуть прежнее поведение было бы неоткуда. Учтите: применение
-- отката ВОЗВРАЩАЕТ дыру приватности, это аварийная мера.
--
-- ------------------------------------------------------------
-- ПРОБЛЕМА
-- ------------------------------------------------------------
-- Все RPC внутреннего чата — SECURITY DEFINER, то есть выполняются от владельца
-- базы и RLS их не проверяет. При этом «кто я» они берут ИЗ БРАУЗЕРА, параметром
-- (p_employee_id / p_sender_id), и нигде не сверяют его с auth.uid(). Политики
-- из 20260811 на них не действуют — они закрыли прямые запросы from(), а эти
-- функции идут мимо.
--
-- Рабочая цепочка (подтверждено на живой базе):
--   get_employees_for_chat()          -> id всех сотрудников
--   get_my_internal_chats(<чужой id>) -> id его чатов
--   get_internal_messages(<chat_id>)  -> вся переписка
-- Плюс send_internal_message(chat, <чужой sender_id>, ...) — сообщение от чужого
-- имени, и mark_internal_chat_read(chat, <чужой id>) — гашение чужих непрочитанных.
--
-- ------------------------------------------------------------
-- ЭТО ХУЖЕ, ЧЕМ «ПОДКОВАННЫЙ СОТРУДНИК». ГЛАВНОЕ В ЭТОЙ МИГРАЦИИ
-- ------------------------------------------------------------
-- У всех девяти функций EXECUTE выдан роли anon (проверено:
--   proacl = ... anon=X/postgres, authenticated=X/postgres ...).
-- anon — это роль публичного ключа, который лежит в собранном JS на сайте.
-- Значит вызвать их может кто угодно из интернета, БЕЗ ВХОДА В СИСТЕМУ.
-- Проверено фактически 2026-08-11: POST /rest/v1/rpc/get_employees_for_chat
-- с одним лишь anon-ключом вернул 200 и полный список сотрудников с ролями и
-- филиалами. Дальше по цепочке — переписка (сама переписка НЕ выгружалась).
--
-- Поэтому в миграции ДВА независимых слоя, и второй важнее первого:
--   1) проверки внутри тел (ниже, разделы 2-9);
--   2) снятие EXECUTE с anon и PUBLIC (раздел 10).
-- Даже если завтра появится новая функция без проверок, раздел 10 не даст
-- вызвать её без входа в систему. И наоборот: даже если кто-то вернёт грант
-- anon, проверки в телах вернут «нет доступа», потому что у anon
-- auth.uid() = NULL -> get_employee_id() = NULL -> is_active_employee() = false.
--
-- ------------------------------------------------------------
-- ПРАВИЛА (те же, что в 20260811 — новых сущностей не заводим)
-- ------------------------------------------------------------
-- Берём готовые функции из 20260811_internal_chat_rls_privacy.sql:
--   is_active_employee()             -- активный ли я сотрудник
--   is_internal_chat_member(chat)    -- состою ли я в чате
--   can_read_internal_chat(chat)     -- активный И (участник ИЛИ admin)
-- и центральную get_employee_id() из базы. Своих копий «кто я» НЕ создаём —
-- по той же причине, что описана в 20260811: два ответа на один вопрос разойдутся.
--
-- Итоговые правила:
--   * идентификатор сотрудника берётся ТОЛЬКО из get_employee_id();
--     переданный параметр используется как заявка и сверяется — если в нём
--     стоит ЧУЖОЙ id, отказ (см. «почему отказ, а не тихая подмена» ниже).
--     NULL в параметре — не расхождение, а «не указано»: работаем от себя.
--     Так сделано намеренно, чтобы вызов без параметра не падал; дырой это не
--     является, потому что все запросы всё равно идут от get_employee_id(),
--     а не от параметра;
--   * читать чат (сообщения, состав) — участник ИЛИ admin  = can_read_internal_chat();
--   * писать в чат — ТОЛЬКО участник. admin сюда не входит: читать чужое ему
--     разрешено решением владельца, писать от лица чужого чата — нет.
--     Ровно так же устроена политика internal_messages_insert из 20260811;
--   * неактивный сотрудник (is_active = false) — отказ везде.
--
-- ЕЩЁ ОДНО ОБЩЕЕ ИЗМЕНЕНИЕ: SET search_path = public, pg_temp У ВСЕХ ВОСЬМИ.
-- На базе было по-разному: у семи стояло SET search_path TO 'public', у
-- get_internal_messages не стояло ничего (proconfig = null). Оба варианта
-- дырявые. Если pg_temp не указан явно, Postgres ищет во временной схеме
-- ПЕРВОЙ, а временные таблицы может создавать любой вошедший пользователь.
-- То есть сотрудник мог создать свою временную таблицу employees или
-- internal_chat_members, и SECURITY DEFINER функция, выполняясь от владельца
-- базы, прочитала бы подсунутую таблицу вместо настоящей — включая проверки
-- прав из этой самой миграции. Явное «pg_temp последним» это закрывает.
-- Ровно тот же вид записи уже используют функции из 20260811.
-- На поведение не влияет: все таблицы и функции внутри лежат в public,
-- auth.uid() и net.* вызываются с явной схемой.
--
-- ПОЧЕМУ ОТКАЗ, А НЕ ТИХАЯ ПОДМЕНА ПАРАМЕТРА.
-- Оба варианта безопасны. Отказ выбран потому, что легитимный клиент ВСЕГДА
-- шлёт свой собственный id (проверено по всем вызовам, список ниже), значит
-- расхождение = либо баг, либо попытка залезть в чужое, и в обоих случаях лучше
-- увидеть ошибку, чем молча получить свои данные вместо чужих. Код ошибки 42501
-- PostgREST отдаёт как HTTP 403.
--
-- ------------------------------------------------------------
-- ПОЧЕМУ ЛЕГИТИМНЫЕ ПОЛЬЗОВАТЕЛИ НИЧЕГО НЕ ЗАМЕТЯТ
-- ------------------------------------------------------------
-- Все места в коде, где вызываются эти RPC, передают id ТЕКУЩЕГО сотрудника
-- (employee из useAuth) — проверено пофайлово:
--   CompanyChatList.tsx:68,75   getMyInternalChats(currentEmployee.id)
--   CompanyChatList.tsx:231     getOrCreateDirectChat(currentEmployee.id, empId)
--   CompanyChatWindow.tsx:184   sendInternalMessage(chat.id, currentEmployeeId, ...)
--   CompanyChatWindow.tsx:73,103,128  markAsRead(chat.id, currentEmployeeId)
--   App.tsx:391                 get_unread_internal_count({ p_employee_id: employee.id })
--   CompanyChatList.tsx:159,289,305   getAllEmployees()  -- без параметров
-- currentEmployee/currentEmployeeId приходят из App.tsx (employee из useAuth),
-- то есть это всегда сам вошедший пользователь. Поэтому сверка «параметр =
-- get_employee_id()» для штатного пути всегда истинна.
-- Чаты, которые отдаёт get_my_internal_chats, — только те, где ты участник
-- (JOIN internal_chat_members), поэтому открыть чат, в котором тебя нет, из UI
-- нельзя, и проверка членства при чтении/отправке тоже всегда проходит.
--
-- ------------------------------------------------------------
-- ЧТО НАРОЧНО НЕ ТРОНУТО
-- ------------------------------------------------------------
-- 1. get_total_unread_for_employee(p_employee_id) — ТЕЛО НЕ МЕНЯЕМ.
--    Её вызывает edge-функция send-push (supabase/functions/send-push/index.ts:65)
--    под SERVICE_ROLE_KEY и намеренно для ЧУЖОГО id — считает бейдж получателю
--    пуша. Проверка «параметр = мой id» сломала бы пуши. Вместо этого у неё
--    просто снимается EXECUTE с anon/authenticated (раздел 10): из браузера её
--    не вызывает никто (проверено по всему репозиторию), а service_role
--    свой доступ сохраняет.
-- 2. get_employee_id() / get_user_role() — не трогаем, на них висят политики
--    в reminders/tasks и др. (то же ограничение, что в 20260811).
-- 3. Функции и политики из 20260811 не пересоздаются. Пересечения нет:
--    там создавались is_active_employee, is_internal_chat_member,
--    can_read_internal_chat, can_manage_internal_chat,
--    guard_internal_chat_immutable + политики на трёх таблицах;
--    здесь — только 8 RPC, которых 20260811 не касалась вообще.
--    Свежие правки 20260811 эта миграция затереть не может.
--
-- ------------------------------------------------------------
-- ПРЕДПОЛЁТНЫЕ ПРОВЕРКИ (выполнить на живой базе ПЕРЕД применением)
-- ------------------------------------------------------------
-- Часть из них продублирована машинно в DO-блоке ниже — миграция упадёт сама,
-- если что-то не так. Глазами стоит сверить вот это:
--
-- 1) Миграция 20260811 применена (иначе здесь нечего вызывать):
--      SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public'
--        AND proname IN ('is_active_employee','is_internal_chat_member',
--                        'can_read_internal_chat','can_manage_internal_chat');
--      -- ожидаем 4 строки
--
-- 2) Сигнатуры не разъехались с теми, под которые написана миграция:
--      SELECT proname, pg_get_function_identity_arguments(p.oid), prosecdef
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND proname IN
--        ('get_internal_messages','get_my_internal_chats','send_internal_message',
--         'mark_internal_chat_read','create_or_get_direct_chat',
--         'get_employees_for_chat','get_unread_internal_count','get_internal_chat_data')
--      ORDER BY proname;
--      -- ожидаем ровно 8 строк, prosecdef = true у всех, аргументы:
--      --   create_or_get_direct_chat  p_employee1_id uuid, p_employee2_id uuid
--      --   get_employees_for_chat     (без аргументов)
--      --   get_internal_chat_data     p_chat_id uuid
--      --   get_internal_messages      p_chat_id uuid, p_limit integer
--      --   get_my_internal_chats      p_employee_id uuid
--      --   get_unread_internal_count  p_employee_id uuid
--      --   mark_internal_chat_read    p_chat_id uuid, p_employee_id uuid
--      --   send_internal_message      p_chat_id uuid, p_sender_id uuid, p_content text
--      -- Если хоть одна строка отличается — ОСТАНОВИТЬСЯ. CREATE OR REPLACE
--      -- не умеет менять имена аргументов и тип результата: миграция либо
--      -- упадёт, либо создаст ВТОРУЮ перегрузку рядом со старой (дырявой),
--      -- и PostgREST может продолжить звать старую.
--
-- 3) Тела на базе совпадают с тем, из чего сделан суперсет (если после
--    2026-08-11 их кто-то правил — сверить руками, иначе правка потеряется):
--      SELECT proname, md5(pg_get_functiondef(p.oid))
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND proname IN (... тот же список ...)
--      ORDER BY proname;
--    Сверить с приложенной выгрузкой глазами по ключевым местам.
--
-- 4) Текущие гранты (чтобы было с чем сравнить после):
--      SELECT proname, array_to_string(proacl,' | ')
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND proname IN (... тот же список ...,
--                                               'get_total_unread_for_employee');
--      -- на 2026-08-11 у всех девяти есть anon=X/postgres — это и закрываем
--
-- 5) Дублей employees на один user_id нет (иначе get_employee_id() выбирает
--    случайную строку из двух):
--      SELECT user_id, count(*) FROM employees WHERE user_id IS NOT NULL
--      GROUP BY user_id HAVING count(*) > 1;   -- ожидаем 0 строк
--
-- ------------------------------------------------------------
-- ВНИМАНИЕ ПРО ПРИМЕНЕНИЕ (как и в 20260811)
-- ------------------------------------------------------------
-- supabase/.temp/linked-project.json указывает на ЧУЖОЙ проект
-- (htqqxmqbamfjzahkwuuz «Saldo Beauty»). `supabase db push` отсюда уйдёт не в ту
-- базу. Применять только точечно: SQL-редактор проекта toxspgdkvxmpsvtecesy
-- или Management API с явным project ref.
-- ============================================================


BEGIN;

-- ============================================================
-- 1. Предполётные проверки машинно
-- ============================================================
-- Лучше упасть здесь, чем создать функции, которые ссылаются на несуществующие
-- проверки, или создать вторую перегрузку рядом со старой дырявой.

DO $$
DECLARE
  v_missing text;
BEGIN
  -- 1a. Функции-предикаты из 20260811
  IF to_regprocedure('public.is_active_employee()') IS NULL THEN
    RAISE EXCEPTION 'Нет public.is_active_employee() — сначала примените 20260811_internal_chat_rls_privacy.sql';
  END IF;
  IF to_regprocedure('public.is_internal_chat_member(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Нет public.is_internal_chat_member(uuid) — сначала примените 20260811_internal_chat_rls_privacy.sql';
  END IF;
  IF to_regprocedure('public.can_read_internal_chat(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Нет public.can_read_internal_chat(uuid) — сначала примените 20260811_internal_chat_rls_privacy.sql';
  END IF;
  IF to_regprocedure('public.get_employee_id()') IS NULL THEN
    RAISE EXCEPTION 'Нет public.get_employee_id() — миграция рассчитана на неё.';
  END IF;

  -- 1b. Все 9 функций существуют РОВНО с теми сигнатурами, под которые написан
  -- суперсет. Если типов аргументов нет — CREATE OR REPLACE ниже создаст ВТОРУЮ
  -- перегрузку, старая (без проверок) останется вызываемой, и дыра не закроется.
  -- get_total_unread_for_employee тело не меняет, но ей снимаются гранты в
  -- разделе 10 — поэтому проверяем и её.
  SELECT string_agg(sig, ', ') INTO v_missing
  FROM unnest(ARRAY[
    'public.get_internal_messages(uuid,integer)',
    'public.get_my_internal_chats(uuid)',
    'public.get_unread_internal_count(uuid)',
    'public.get_internal_chat_data(uuid)',
    'public.get_employees_for_chat()',
    'public.send_internal_message(uuid,uuid,text)',
    'public.mark_internal_chat_read(uuid,uuid)',
    'public.create_or_get_direct_chat(uuid,uuid)',
    'public.get_total_unread_for_employee(uuid)'
  ]) AS sig
  WHERE to_regprocedure(sig) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Сигнатуры на базе разошлись с миграцией, нет: %. Остановитесь и сверьте вручную (см. предполётную проверку 2).', v_missing;
  END IF;

  -- 1в. Отдельно — ИМЕНА аргументов и ТИП РЕЗУЛЬТАТА. Проверка 1б их не видит:
  -- to_regprocedure сверяет только типы. А CREATE OR REPLACE не умеет ни
  -- переименовать аргумент («cannot change name of input parameter»), ни
  -- поменять тип результата («cannot change return type of existing function»).
  -- Без этой проверки миграция упала бы на середине с невнятной ошибкой; вся
  -- транзакция откатится в любом случае, но лучше сказать сразу и понятно.
  SELECT string_agg(x.proname || ' (' || x.actual || ')', ', ') INTO v_missing
  FROM (
    VALUES
      ('get_internal_messages',        'p_chat_id uuid, p_limit integer',            'json'),
      ('get_my_internal_chats',        'p_employee_id uuid',                         'json'),
      ('get_unread_internal_count',    'p_employee_id uuid',                         'integer'),
      ('get_internal_chat_data',       'p_chat_id uuid',                             'json'),
      ('get_employees_for_chat',       '',                                           'record'),
      ('send_internal_message',        'p_chat_id uuid, p_sender_id uuid, p_content text', 'json'),
      ('mark_internal_chat_read',      'p_chat_id uuid, p_employee_id uuid',         'void'),
      ('create_or_get_direct_chat',    'p_employee1_id uuid, p_employee2_id uuid',   'uuid')
  ) AS expected(proname, args, rettype)
  CROSS JOIN LATERAL (
    SELECT expected.proname,
           pg_get_function_identity_arguments(p.oid) AS actual,
           pg_catalog.format_type(p.prorettype, NULL) AS actual_ret
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = expected.proname
    LIMIT 1
  ) AS x
  WHERE x.actual <> expected.args OR x.actual_ret <> expected.rettype;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Имена аргументов или тип результата на базе отличаются от миграции: %. CREATE OR REPLACE такое не переживёт — сверьте вручную (предполётная проверка 2).', v_missing;
  END IF;
END;
$$;


-- ============================================================
-- 2. get_employees_for_chat() — список сотрудников
-- ============================================================
-- Было: никакой проверки. Это первая ступень цепочки — отсюда берутся id
-- сотрудников для get_my_internal_chats. И именно она проверенно отдавалась
-- по anon-ключу без входа в систему.
-- Стало: только активный сотрудник. Сам список не меняется — те же активные
-- сотрудники всех филиалов, в том же порядке (внутренний чат по филиалам
-- не режем, см. 20260811).
CREATE OR REPLACE FUNCTION public.get_employees_for_chat()
 RETURNS TABLE(id uuid, name text, role text, branch_id uuid, branch_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_active_employee() THEN
    RAISE EXCEPTION 'Нет доступа: только активный сотрудник' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.role,
    e.branch_id,
    b.name AS branch_name
  FROM employees e
  LEFT JOIN branches b ON b.id = e.branch_id
  WHERE e.is_active = true
  ORDER BY e.name;
END;
$function$;


-- ============================================================
-- 3. get_my_internal_chats(p_employee_id) — мои чаты
-- ============================================================
-- Было: чей id передали, того чаты и вернули.
-- Стало: работаем строго от get_employee_id(). Параметр оставлен в сигнатуре
-- (его шлёт клиент, менять сигнатуру нельзя), но теперь это лишь заявка:
-- если он не совпадает с настоящим — отказ. Внутри везде подставляется
-- v_employee_id, а не p_employee_id, — чтобы даже при будущей правке проверки
-- тело не могло случайно посчитать чужое.
CREATE OR REPLACE FUNCTION public.get_my_internal_chats(p_employee_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result JSON;
  v_employee_id UUID;
BEGIN
  v_employee_id := public.get_employee_id();

  IF NOT public.is_active_employee() OR v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Нет доступа: только активный сотрудник' USING ERRCODE = '42501';
  END IF;
  -- NULL в параметре допускаем — тогда просто берём себя.
  IF p_employee_id IS NOT NULL AND p_employee_id <> v_employee_id THEN
    RAISE EXCEPTION 'Нет доступа: нельзя запрашивать чаты другого сотрудника' USING ERRCODE = '42501';
  END IF;

  SELECT json_agg(chat_data ORDER BY last_msg_at DESC NULLS LAST)
  INTO v_result
  FROM (
    SELECT
      json_build_object(
        'id', c.id,
        'type', c.type,
        'name', c.name,
        'created_by', c.created_by,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'members', (
          SELECT json_agg(json_build_object(
            'employee_id', m2.employee_id,
            'last_read_at', m2.last_read_at,
            'employees', json_build_object(
              'id', e2.id,
              'name', e2.name,
              'role', e2.role,
              'branch_id', e2.branch_id
            )
          ))
          FROM internal_chat_members m2
          JOIN employees e2 ON e2.id = m2.employee_id
          WHERE m2.chat_id = c.id
        ),
        'last_message', (
          SELECT json_build_object(
            'content', msg.content,
            'created_at', msg.created_at,
            'sender_id', msg.sender_id
          )
          FROM internal_messages msg
          WHERE msg.chat_id = c.id
          ORDER BY msg.created_at DESC
          LIMIT 1
        ),
        'unread_count', (
          SELECT COUNT(*)
          FROM internal_messages msg
          LEFT JOIN internal_chat_members my_m
            ON my_m.chat_id = c.id AND my_m.employee_id = v_employee_id
          WHERE msg.chat_id = c.id
          AND (my_m.last_read_at IS NULL OR msg.created_at > my_m.last_read_at)
          AND msg.sender_id != v_employee_id
        )
      ) as chat_data,
      c.updated_at as last_msg_at
    FROM internal_chats c
    JOIN internal_chat_members m ON m.chat_id = c.id AND m.employee_id = v_employee_id
  ) sub;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$;


-- ============================================================
-- 4. get_unread_internal_count(p_employee_id) — счётчик непрочитанных
-- ============================================================
-- Было: счётчик любого сотрудника.
-- Стало: только свой. Логика подсчёта не тронута, p_employee_id заменён на
-- v_employee_id в обоих местах.
CREATE OR REPLACE FUNCTION public.get_unread_internal_count(p_employee_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count INTEGER;
  v_employee_id UUID;
BEGIN
  v_employee_id := public.get_employee_id();

  IF NOT public.is_active_employee() OR v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Нет доступа: только активный сотрудник' USING ERRCODE = '42501';
  END IF;
  IF p_employee_id IS NOT NULL AND p_employee_id <> v_employee_id THEN
    RAISE EXCEPTION 'Нет доступа: нельзя запрашивать счётчик другого сотрудника' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM internal_messages m
  JOIN internal_chat_members mem
    ON mem.chat_id = m.chat_id
    AND mem.employee_id = v_employee_id
  WHERE m.sender_id != v_employee_id
  AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at);

  RETURN COALESCE(v_count, 0);
END;
$function$;


-- ============================================================
-- 5. get_internal_messages(p_chat_id, p_limit) — сообщения чата
-- ============================================================
-- Было: любые сообщения по любому chat_id. Это конечная ступень цепочки —
-- собственно чтение чужой переписки.
-- Стало: только тот, кто может читать чат (участник или admin).
--
-- Дополнительно проставлен SET search_path — у этой функции его НЕ БЫЛО
-- (proconfig = null, проверено). Для SECURITY DEFINER это отдельная дыра:
-- вызывающий может подсунуть свою схему первой в search_path и подменить
-- таблицу employees/internal_messages на свою. Ссылки внутри не менялись —
-- все объекты и так в public, поведение прежнее.
-- DEFAULT 50 у p_limit сохранён: клиент иногда зовёт функцию без него.
CREATE OR REPLACE FUNCTION public.get_internal_messages(p_chat_id uuid, p_limit integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.can_read_internal_chat(p_chat_id) THEN
    RAISE EXCEPTION 'Нет доступа к этому чату' USING ERRCODE = '42501';
  END IF;

  SELECT json_agg(msg_data ORDER BY created_at ASC)
  INTO v_result
  FROM (
    SELECT json_build_object(
      'id', m.id,
      'chat_id', m.chat_id,
      'sender_id', m.sender_id,
      'content', m.content,
      'created_at', m.created_at,
      'message_type', m.message_type,
      'media_url', m.media_url,
      'sender', json_build_object('id', e.id, 'name', e.name)
    ) as msg_data,
    m.created_at
    FROM internal_messages m
    JOIN employees e ON e.id = m.sender_id
    WHERE m.chat_id = p_chat_id
    ORDER BY m.created_at DESC
    LIMIT p_limit
  ) sub;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$;


-- ============================================================
-- 6. get_internal_chat_data(p_chat_id) — карточка чата и состав участников
-- ============================================================
-- Было: состав любого чата по его id (кто с кем переписывается — это тоже
-- приватные данные, даже без текстов).
-- Стало: участник или admin.
-- Штатный вызов идёт сразу после create_or_get_direct_chat
-- (internalChat.ts:66) — к этому моменту вызывающий уже участник созданного
-- чата, поэтому проверка проходит.
CREATE OR REPLACE FUNCTION public.get_internal_chat_data(p_chat_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.can_read_internal_chat(p_chat_id) THEN
    RAISE EXCEPTION 'Нет доступа к этому чату' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'id', c.id,
    'type', c.type,
    'name', c.name,
    'created_by', c.created_by,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'members', (
      SELECT json_agg(json_build_object(
        'employee_id', m.employee_id,
        'last_read_at', m.last_read_at,
        'employees', json_build_object(
          'id', e.id,
          'name', e.name,
          'role', e.role,
          'branch_id', e.branch_id
        )
      ))
      FROM internal_chat_members m
      JOIN employees e ON e.id = m.employee_id
      WHERE m.chat_id = c.id
    )
  ) INTO v_result
  FROM internal_chats c
  WHERE c.id = p_chat_id;

  RETURN v_result;
END;
$function$;


-- ============================================================
-- 7. send_internal_message(p_chat_id, p_sender_id, p_content) — отправка
-- ============================================================
-- Было: сообщение от ЛЮБОГО имени в ЛЮБОЙ чат. Самое опасное из всего списка:
-- это не чтение, а подделка — в переписке остаётся сообщение, которое
-- выглядит как написанное другим человеком, и отличить его нельзя.
-- Стало: отправитель = get_employee_id() (параметр только сверяется),
-- и только в чат, где отправитель состоит.
-- admin НЕ получает право писать в чужой чат — то же правило, что в политике
-- internal_messages_insert из 20260811.
--
-- Триггер пушей notify_push_internal_message срабатывает как прежде: он висит
-- на INSERT в internal_messages, а вставка осталась на месте.
CREATE OR REPLACE FUNCTION public.send_internal_message(p_chat_id uuid, p_sender_id uuid, p_content text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_message_id UUID;
  v_result JSON;
  v_sender_id UUID;
BEGIN
  v_sender_id := public.get_employee_id();

  IF NOT public.is_active_employee() OR v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Нет доступа: только активный сотрудник' USING ERRCODE = '42501';
  END IF;
  IF p_sender_id IS NOT NULL AND p_sender_id <> v_sender_id THEN
    RAISE EXCEPTION 'Нет доступа: нельзя отправлять сообщения от чужого имени' USING ERRCODE = '42501';
  END IF;
  -- Именно участник, без ветки admin: читать чужое админу можно, писать — нет.
  IF NOT public.is_internal_chat_member(p_chat_id) THEN
    RAISE EXCEPTION 'Нет доступа: вы не участник этого чата' USING ERRCODE = '42501';
  END IF;

  INSERT INTO internal_messages (chat_id, sender_id, content)
  VALUES (p_chat_id, v_sender_id, p_content)
  RETURNING id INTO v_message_id;

  UPDATE internal_chats SET updated_at = NOW() WHERE id = p_chat_id;

  UPDATE internal_chat_members
  SET last_read_at = NOW()
  WHERE chat_id = p_chat_id AND employee_id = v_sender_id;

  SELECT json_build_object(
    'id', m.id,
    'chat_id', m.chat_id,
    'sender_id', m.sender_id,
    'content', m.content,
    'created_at', m.created_at,
    'sender', json_build_object('id', e.id, 'name', e.name)
  ) INTO v_result
  FROM internal_messages m
  JOIN employees e ON e.id = m.sender_id
  WHERE m.id = v_message_id;

  RETURN v_result;
END;
$function$;


-- ============================================================
-- 8. mark_internal_chat_read(p_chat_id, p_employee_id) — отметка «прочитано»
-- ============================================================
-- Было: можно было погасить непрочитанные ЧУЖОМУ сотруднику — тихая пакость,
-- человек просто не увидит, что ему написали.
-- Стало: отметка ставится только себе.
--
-- Проверку членства отдельным RAISE сознательно НЕ добавляем: WHERE в UPDATE
-- и так содержит employee_id = v_employee_id, поэтому для не-участника запрос
-- просто ничего не меняет. Если бы здесь стояло исключение, оно ломало бы
-- открытие чата у админа-не-участника (CompanyChatWindow зовёт markAsRead
-- при каждом открытии и фокусе). Тихий ноль тут безопаснее.
CREATE OR REPLACE FUNCTION public.mark_internal_chat_read(p_chat_id uuid, p_employee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_employee_id UUID;
BEGIN
  v_employee_id := public.get_employee_id();

  IF NOT public.is_active_employee() OR v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Нет доступа: только активный сотрудник' USING ERRCODE = '42501';
  END IF;
  IF p_employee_id IS NOT NULL AND p_employee_id <> v_employee_id THEN
    RAISE EXCEPTION 'Нет доступа: нельзя отмечать прочитанным за другого сотрудника' USING ERRCODE = '42501';
  END IF;

  UPDATE internal_chat_members
  SET last_read_at = NOW()
  WHERE chat_id = p_chat_id
  AND employee_id = v_employee_id;
END;
$function$;


-- ============================================================
-- 9. create_or_get_direct_chat(p_employee1_id, p_employee2_id) — личный чат
-- ============================================================
-- Было: можно было спросить «есть ли личный чат между А и Б» для любых двух
-- чужих людей и получить его id — а дальше читать его через
-- get_internal_messages. То есть это ещё один вход в цепочку, мимо
-- get_my_internal_chats. И можно было создать чат от чужого имени.
-- Стало: первый участник — всегда сам вызывающий.
--
-- Порядок проверок важен и выбран так, чтобы ничего не сломать:
--   * поиск СУЩЕСТВУЮЩЕГО чата идёт как раньше, до проверки активности
--     собеседника, — иначе переставший быть активным собеседник сделал бы
--     старую переписку недоступной;
--   * проверка «собеседник — существующий активный сотрудник» стоит только
--     на ветке СОЗДАНИЯ. Штатно UI и так предлагает только активных
--     (список из get_employees_for_chat), поэтому легитимный путь не меняется;
--     а мусорные чаты на выдуманные uuid создать больше нельзя.
--   * чат с самим собой отсекаем явной ошибкой. Раньше он падал на UNIQUE
--     (chat_id, employee_id) уже ПОСЛЕ создания строки в internal_chats,
--     то есть оставлял за собой пустой чат.
CREATE OR REPLACE FUNCTION public.create_or_get_direct_chat(p_employee1_id uuid, p_employee2_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_chat_id UUID;
  v_me UUID;
BEGIN
  v_me := public.get_employee_id();

  IF NOT public.is_active_employee() OR v_me IS NULL THEN
    RAISE EXCEPTION 'Нет доступа: только активный сотрудник' USING ERRCODE = '42501';
  END IF;
  IF p_employee1_id IS NOT NULL AND p_employee1_id <> v_me THEN
    RAISE EXCEPTION 'Нет доступа: личный чат можно создавать только от своего имени' USING ERRCODE = '42501';
  END IF;
  IF p_employee2_id IS NULL THEN
    RAISE EXCEPTION 'Не указан собеседник' USING ERRCODE = '22023';
  END IF;
  IF p_employee2_id = v_me THEN
    RAISE EXCEPTION 'Нельзя создать личный чат с самим собой' USING ERRCODE = '22023';
  END IF;

  SELECT m1.chat_id INTO v_chat_id
  FROM internal_chat_members m1
  JOIN internal_chat_members m2
    ON m2.chat_id = m1.chat_id
    AND m2.employee_id = p_employee2_id
  JOIN internal_chats c
    ON c.id = m1.chat_id
    AND c.type = 'direct'
  WHERE m1.employee_id = v_me
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  -- Дальше — только создание нового чата.
  IF NOT EXISTS (
    SELECT 1 FROM employees
    WHERE id = p_employee2_id AND COALESCE(is_active, true)
  ) THEN
    RAISE EXCEPTION 'Собеседник не найден среди активных сотрудников' USING ERRCODE = '42501';
  END IF;

  INSERT INTO internal_chats (type, created_by)
  VALUES ('direct', v_me)
  RETURNING id INTO v_chat_id;

  INSERT INTO internal_chat_members (chat_id, employee_id)
  VALUES (v_chat_id, v_me), (v_chat_id, p_employee2_id);

  RETURN v_chat_id;
END;
$function$;


-- ============================================================
-- 10. Гранты — второй слой защиты, снимаем доступ у anon
-- ============================================================
-- CREATE OR REPLACE гранты НЕ трогает, поэтому без этого раздела anon сохранил
-- бы EXECUTE (сами проверки его, конечно, уже не пустят — но полагаться на
-- один слой не стоит).
--
-- REVOKE ... FROM PUBLIC убирает грант по умолчанию (в ACL он выглядит как
-- «=X/postgres»), отдельный REVOKE FROM anon — персональный грант роли anon.
-- Нужны оба: одного PUBLIC мало.
--
-- authenticated оставляем — это роль вошедшего сотрудника, ей эти функции нужны.
--
-- service_role НЕ упоминаем сознательно. Его существующий грант мы не снимаем
-- (REVOKE идёт только у PUBLIC и anon), но и выдавать заново не надо — это
-- вводило бы в заблуждение: под service-ключом auth.uid() пустой, значит
-- get_employee_id() = NULL, is_active_employee() = false, и любая из восьми
-- функций ответит отказом. Право было бы, а вызов всё равно не прошёл бы.
-- Если серверному коду когда-нибудь понадобится звать их от имени сотрудника —
-- это отдельная задача (нужен либо параметр «за кого», либо обход проверок),
-- а не просто GRANT.

REVOKE ALL ON FUNCTION public.get_employees_for_chat()                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_internal_chats(uuid)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_unread_internal_count(uuid)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_internal_messages(uuid, integer)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_internal_chat_data(uuid)                    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_internal_message(uuid, uuid, text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_internal_chat_read(uuid, uuid)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_or_get_direct_chat(uuid, uuid)           FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_employees_for_chat()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_internal_chats(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_internal_count(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_messages(uuid, integer)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_chat_data(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_internal_message(uuid, uuid, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_internal_chat_read(uuid, uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_get_direct_chat(uuid, uuid)        TO authenticated;

-- get_total_unread_for_employee — тело не трогаем (см. шапку, пункт 1
-- «ЧТО НАРОЧНО НЕ ТРОНУТО»), но из браузера её звать незачем: в репозитории
-- нет ни одного клиентского вызова, только edge-функция send-push под
-- service_role. Поэтому убираем и anon, и authenticated.
-- Если позже понадобится показывать общий бейдж из браузера — вызов должен
-- идти за своим id, и тогда сюда добавится такая же проверка, как в разделе 4,
-- плюс GRANT authenticated.
REVOKE ALL ON FUNCTION public.get_total_unread_for_employee(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_total_unread_for_employee(uuid) TO service_role;

COMMIT;


-- ============================================================
-- 11. Проверка после применения
-- ============================================================
-- 1) Грантов у anon больше нет ни у одной из девяти:
--      SELECT proname, array_to_string(proacl, ' | ') AS acl
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND proname IN
--        ('get_internal_messages','get_my_internal_chats','send_internal_message',
--         'mark_internal_chat_read','create_or_get_direct_chat',
--         'get_employees_for_chat','get_unread_internal_count',
--         'get_internal_chat_data','get_total_unread_for_employee')
--      ORDER BY proname;
--      -- ожидаем: НИ В ОДНОЙ строке нет «anon=X»
--
-- 2) Главная проверка — снаружи, без входа в систему. Тем же публичным ключом,
--    что лежит в .env (VITE_SUPABASE_ANON_KEY):
--      curl -s -o /dev/null -w "%{http_code}\n" -X POST \
--        "https://toxspgdkvxmpsvtecesy.supabase.co/rest/v1/rpc/get_employees_for_chat" \
--        -H "apikey: <VITE_SUPABASE_ANON_KEY>" -H "Content-Type: application/json" -d '{}'
--      -- было 200 со списком сотрудников, ожидаем 401/403
--
-- 3) Под обычным сотрудником (НЕ админом) в SQL-редакторе или из приложения:
--      select get_my_internal_chats('<id ЧУЖОГО сотрудника>');   -- ожидаем 42501
--      select get_internal_messages('<id чужого чата>', 50);      -- ожидаем 42501
--      select send_internal_message('<чужой чат>', '<чужой id>', 'тест'); -- 42501
--    Под админом get_internal_messages('<чужой чат>') должен ОТДАТЬ сообщения
--    (чтение админу разрешено), а send_internal_message в чужой чат — 42501.
--
-- 4) Приложение под обычным сотрудником — ничего не сломалось:
--    список чатов грузится, счётчик непрочитанных совпадает с прежним,
--    открытие чата гасит бейдж, отправка текста и фото работает,
--    открытие нового личного чата из списка сотрудников работает,
--    создание группового чата работает, пуш получателю доходит.
--
--
-- ============================================================
-- 12. Что осталось за рамками — отдельными задачами
-- ============================================================
-- 1. notify_push_internal_message() — SECURITY DEFINER БЕЗ SET search_path
--    (proconfig = null, проверено). Здесь не трогаем: функция ходит в vault за
--    service_role-ключом и шлёт HTTP, любая правка требует отдельной проверки
--    пушей. То же и у get_employee_id()/get_user_role() — их не трогаем по
--    причине из 20260811 (на них завязаны политики reminders/tasks).
-- 2. Медиа внутреннего чата (бакет chat-media) — ПРОВЕРЕНО 2026-08-11, дыра есть,
--    но она не в RPC, поэтому чинится отдельной задачей.
--    Сам бакет приватный (storage.buckets.public = false) — это хорошо.
--    НО на storage.objects висит политика:
--      «Anyone can view media»  FOR SELECT  TO public  USING (bucket_id = 'chat-media')
--    Роль public включает anon, то есть файл из чата может скачать кто угодно,
--    зная путь к объекту, — проверки членства в чате тут нет вообще.
--    Правильная политика должна пускать только участника чата, например через
--    сопоставление storage.objects.name с internal_messages.media_url и
--    can_read_internal_chat(). Здесь это НЕ делаем: другая таблица, другой риск,
--    нужен отдельный тест загрузки/просмотра.
--    Побочно замечено: клиент строит ссылку через getPublicUrl()
--    (CompanyChatWindow.tsx, путь /object/public/...), а для приватного бакета
--    этот путь не работает — стоит проверить, показываются ли вложения в UI
--    вообще.
-- 2а. ПРОВЕРЕНО ОТДЕЛЬНО (по замечанию код-ревью): не утекает ли тот же список
--    сотрудников мимо RPC, прямым запросом /rest/v1/employees. НЕТ, не утекает.
--    На employees включён RLS, и все три политики SELECT требуют авторизации:
--      «Admins can view all employees»          USING (get_user_role() = 'admin')
--      «Users can view their own employee record» USING (auth.uid() = user_id)
--      «authenticated_view_employees»            USING (auth.uid() IS NOT NULL)
--    У anon auth.uid() пустой, роли нет — все три дают false, строк ноль.
--    То есть get_employees_for_chat действительно был единственным входом для
--    неавторизованного, и раздел 10 его закрывает.
--    (Заодно видно: любой ВОШЕДШИЙ сотрудник по-прежнему видит весь список
--    сотрудников — это осознанно, внутреннему чату он нужен.)
--
-- 3. ТА ЖЕ БОЛЕЗНЬ ЕСТЬ НЕ ТОЛЬКО ВО ВНУТРЕННЕМ ЧАТЕ. Запрос
--      SELECT proname, pg_get_function_identity_arguments(p.oid)
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname='public' AND p.prosecdef
--        AND p.proacl::text LIKE '%anon=X%'
--        AND pg_get_function_identity_arguments(p.oid) ~ '(employee|branch|user)_id';
--    на 2026-08-11 показал сверх разобранных здесь ещё три функции —
--    SECURITY DEFINER, с грантом anon, принимающие идентификатор параметром:
--      close_cash_session(p_session_id, p_actual_cash, p_employee_id, p_notes)
--      recalculate_stock(p_branch_id)
--      register_employee(p_branch_id, p_name, p_email, p_admin_code)
--    Первая — про деньги (закрытие смены от чужого имени), поэтому её НЕЛЬЗЯ
--    править заодно, «в довесок»: нужна отдельная задача со своей проверкой
--    кассовых сценариев и согласованием с владельцем. Здесь только фиксируем
--    находку, ничего из этих трёх не трогаем.
--
--    Масштаб проблемы шире: всего SECURITY DEFINER функций с грантом anon в
--    схеме public — 31 штука (посчитано 2026-08-11):
--      SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.prosecdef AND p.proacl::text LIKE '%anon=X%';
--    Это поведение Supabase по умолчанию: каждая новая функция в public получает
--    EXECUTE у anon. Отдельной задачей стоит пройти по всем 31 и снять грант
--    везде, где функция не предназначена для неавторизованного вызова
--    (осознанные исключения есть — например, всё, что нужно на экране входа
--    и регистрации: ср. политику anon_read_branches_for_signup на branches).

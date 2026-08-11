-- ============================================================
-- Внутренние чаты: снятие рекурсии RLS (42P17) + закрытие дыры приватности
-- Дата: 2026-08-11
-- Таблицы: internal_chats, internal_chat_members, internal_messages
--
-- НЕ ПРИМЕНЕНО. Применяет владелец проекта вручную после сверки с живой базой.
-- Перед применением ОБЯЗАТЕЛЬНО выполнить блок «ПРЕДПОЛЁТНАЯ ПРОВЕРКА» ниже.
--
-- ВАЖНО: эта миграция закрывает доступ к таблицам НАПРЯМУЮ. Она НЕ закрывает
-- доступ через существующие RPC — см. раздел «ОСТАЮЩАЯСЯ ДЫРА» в конце файла.
-- Это отдельная задача, её нельзя пропустить.
--
-- ------------------------------------------------------------
-- ПРОБЛЕМА 1 — рекурсия (ошибка 42P17)
-- ------------------------------------------------------------
-- Политика select_internal_chat_members на internal_chat_members внутри себя
-- делала подзапрос к той же internal_chat_members. Postgres при проверке строки
-- запускает политику, та снова читает таблицу, снова запускается политика — и так
-- по кругу: "infinite recursion detected in policy for relation
-- internal_chat_members". Заодно падало чтение internal_chats — её политика
-- ссылалась на ту же таблицу.
-- Следствие: createGroupChat() (src/services/internalChat.ts:78) — единственное
-- место, которое пишет в эти таблицы напрямую, минуя RPC, — падало всегда.
-- В базе 0 групповых чатов.
--
-- РЕШЕНИЕ: проверка членства вынесена в SECURITY DEFINER функцию. Тело такой
-- функции выполняется от владельца таблицы, а владелец RLS не проверяет, — цикл
-- «политика → таблица → политика» разрывается.
-- Дополнительно важно, что функция помечена SECURITY DEFINER и имеет SET-клаузу:
-- из-за этого Postgres НЕ инлайнит её тело в вызывающий запрос. Без этого
-- LANGUAGE sql функция была бы развёрнута обратно в подзапрос внутри политики —
-- и рекурсия вернулась бы.
--
-- ------------------------------------------------------------
-- ПРОБЛЕМА 2 — дыра приватности
-- ------------------------------------------------------------
-- Политика чтения internal_messages была `auth.uid() IS NOT NULL`: любой
-- залогиненный сотрудник прямым запросом (supabase.from('internal_messages'))
-- читал переписку всех остальных, включая личную 1-на-1.
--
-- РЕШЕНИЕ (согласовано с владельцем): сообщение видно только участнику чата
-- ИЛИ администратору компании. То же правило распространено на internal_chats
-- и internal_chat_members — там была та же слишком широкая логика.
--
-- ------------------------------------------------------------
-- ПРО «ИЗОЛЯЦИЮ ПО ОРГАНИЗАЦИИ»
-- ------------------------------------------------------------
-- Мультиарендности в этой базе нет: ни таблицы organizations, ни колонок
-- organization_id/org_id. Вся база = одна компания New Line; внутри неё изоляция
-- идёт по branch_id, а «свой/чужой» определяется связкой
-- employees.user_id = auth.uid().
--
-- Центральные функции проекта, которые здесь и используются:
--   get_user_role()       — роль текущего пользователя (TASKS.md:1096, 1110)
--   get_user_branch_id()  — филиал текущего пользователя (TASKS.md:1047, T45/T64)
-- Обе живут в базе (заведены через MCP, в supabase/migrations/ их нет — репозиторий
-- содержит лишь часть объектов базы, поэтому «нет в репозитории» ≠ «нет в базе»).
--
-- Свою копию проверки роли здесь СПЕЦИАЛЬНО не заводим — иначе в проекте будет
-- два разных ответа на вопрос «я админ?», и они рано или поздно разойдутся.
--
-- Не хватает только «мой employee.id» — центральной функции для него в проекте
-- нет (get_user_branch_id отдаёт филиал, не id сотрудника). Заводим её ниже под
-- именем get_user_employee_id() — в одном стиле с двумя существующими.
--
-- Роль «границы организации» здесь играет условие «активный сотрудник этой базы»:
-- get_user_employee_id() возвращает NULL для любого, кто не активный сотрудник,
-- и тогда ВСЕ политики ниже дают false (fail-closed). Посторонний не получает ничего.
-- Проверка «активен» стоит и перед каждой админской веткой: фильтрует ли is_active
-- сама get_user_role() — неизвестно (тела в репозитории нет), а деактивация
-- сотрудника в UI только разлогинивает (useAuth.ts), выданный JWT продолжает
-- работать против PostgREST. Поэтому на get_user_role() в одиночку не полагаемся.
--
-- По филиалам внутренние чаты НЕ режем сознательно: это общекорпоративный чат,
-- сотрудники разных филиалов должны переписываться (getAllEmployees() отдаёт
-- сотрудников всех филиалов через get_employees_for_chat).
--
-- Ни одна функция ниже не принимает id сотрудника или роль снаружи — только
-- auth.uid() из текущей сессии. Клиент не может подделать «я админ».
-- ============================================================


-- ============================================================
-- ПРЕДПОЛЁТНАЯ ПРОВЕРКА — выполнить ОТДЕЛЬНО, до применения файла
-- ============================================================
-- Результаты сохранить (скриншот/копипаст) — это же и план отката.
--
-- 1) Слепок текущих политик:
--      SELECT tablename, policyname, cmd, roles, qual, with_check
--      FROM pg_policies
--      WHERE schemaname = 'public'
--        AND tablename IN ('internal_chats','internal_chat_members','internal_messages')
--      ORDER BY tablename, policyname;
--
-- 2) FORCE RLS должен быть выключен, иначе SECURITY DEFINER не спасёт от рекурсии
--    (владелец тоже начнёт проверяться политиками). Заодно смотрим владельца
--    таблиц — применять миграцию нужно ролью, которая ими владеет (обычно postgres):
--      SELECT relname, relrowsecurity, relforcerowsecurity, relowner::regrole
--      FROM pg_class
--      WHERE relname IN ('internal_chats','internal_chat_members','internal_messages');
--    Ожидаем relforcerowsecurity = false у всех трёх. Если где-то true — стоп, сообщить.
--
-- 3) Проверить, что имена функций ниже ничего не затрут (CREATE OR REPLACE с другим
--    типом возврата уронит всю миграцию):
--      SELECT proname, prosecdef, pg_get_function_identity_arguments(oid) AS args,
--             pg_get_function_result(oid) AS returns
--      FROM pg_proc
--      WHERE pronamespace = 'public'::regnamespace
--        AND proname IN ('get_user_employee_id','is_internal_chat_member',
--                        'can_read_internal_chat','can_manage_internal_chat',
--                        'get_user_role','get_user_branch_id');
--    Ожидаем: get_user_role и get_user_branch_id существуют, причём у get_user_role
--    prosecdef = true. Остальных четырёх нет.
--    Если get_user_role окажется SECURITY INVOKER — СТОП, не применять: политики
--    ниже зовут её от роли authenticated, её тело будет заинлайнено и прочитает
--    employees под RLS самой employees. В лучшем случае админ молча перестанет
--    определяться, в худшем — новая рекурсия 42P17, если политика на employees
--    сама зовёт get_user_role().
--
-- 3a) RPC внутреннего чата должны быть SECURITY DEFINER — на этом держится вся
--    совместимость. Особенно mark_internal_chat_read: политики UPDATE на
--    internal_chat_members больше нет (см. раздел 5), поэтому если функция окажется
--    SECURITY INVOKER, last_read_at перестанет обновляться и счётчик непрочитанных
--    залипнет навсегда.
--      SELECT proname, prosecdef FROM pg_proc
--      WHERE pronamespace = 'public'::regnamespace
--        AND proname IN ('mark_internal_chat_read','send_internal_message',
--                        'create_or_get_direct_chat','get_internal_chat_data',
--                        'get_my_internal_chats','get_internal_messages',
--                        'get_unread_internal_count','get_employees_for_chat');
--    Все восемь должны быть prosecdef = true. Любой false — стоп, сообщить.
--
-- 4) Дублей сотрудников на один auth-аккаунт быть не должно (иначе «кто я»
--    определяется недетерминированно):
--      SELECT user_id, count(*) FROM public.employees
--      WHERE COALESCE(is_active, true) GROUP BY 1 HAVING count(*) > 1;
--    Ожидаем 0 строк.
--
-- 5) Триггер пуш-уведомлений на internal_messages (TASKS.md:475) должен быть
--    SECURITY DEFINER, иначе его чтения internal_chat_members начнут фильтроваться
--    новыми политиками и пуши молча перестанут доходить:
--      SELECT p.proname, p.prosecdef, pg_get_functiondef(p.oid)
--      FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
--      WHERE t.tgrelid = 'public.internal_messages'::regclass AND NOT t.tgisinternal;
--    Ожидаем prosecdef = true. Если false — сначала починить триггер.
--
-- 6) Индекс под проверку членства (иначе политики будут медленными):
--      SELECT indexname, indexdef FROM pg_indexes
--      WHERE tablename = 'internal_chat_members';
--    Нужен индекс по (employee_id, chat_id) или хотя бы по employee_id.
--
-- ВНИМАНИЕ: supabase/.temp/linked-project.json в этом репозитории указывает на
-- ЧУЖОЙ проект (htqqxmqbamfjzahkwuuz «Saldo Beauty»), а не на toxspgdkvxmpsvtecesy.
-- `supabase db push` отсюда уйдёт не в ту базу и потащит все остальные файлы из
-- supabase/migrations/. Применять ТОЛЬКО вручную, через SQL-редактор нужного проекта.
-- ============================================================


BEGIN;

-- Быстрый отказ, если центральной функции роли в базе всё-таки нет —
-- лучше упасть здесь, чем создать политики, которые ничего не проверяют.
DO $$
BEGIN
  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION 'Нет функции public.get_user_role() — миграция рассчитана на неё. Выполнить пункт 3 предполётной проверки.';
  END IF;
END;
$$;


-- ============================================================
-- 1. Резервная копия текущих политик (план отката, внутри транзакции)
-- ============================================================
-- RAISE NOTICE здесь не годится: SQL-редактор Supabase вывод NOTICE не показывает,
-- «лог удалённого» был бы невидимым. Пишем в таблицу.

CREATE TABLE IF NOT EXISTS public.internal_chat_policy_backup_20260811 (
  captured_at  timestamptz NOT NULL DEFAULT now(),
  tablename    text,
  policyname   text,
  cmd          text,
  roles        text,
  qual         text,
  with_check   text
);

-- Пишем только на ПЕРВОМ прогоне: на повторном в pg_policies лежат уже новые
-- политики, и дозапись превратила бы слепок «как было до» в смесь до/после.
INSERT INTO public.internal_chat_policy_backup_20260811
  (tablename, policyname, cmd, roles, qual, with_check)
SELECT tablename, policyname, cmd, roles::text, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('internal_chats', 'internal_chat_members', 'internal_messages')
  AND NOT EXISTS (SELECT 1 FROM public.internal_chat_policy_backup_20260811);

-- Таблица создаётся в схеме public, а в Supabase на public стоит
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL TO anon, authenticated — то есть без
-- этих двух строк любой залогиненный сотрудник прочитал бы старые тексты политик
-- (карта модели доступа) и мог бы удалить план отката.
ALTER TABLE public.internal_chat_policy_backup_20260811 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.internal_chat_policy_backup_20260811 FROM anon, authenticated;
-- Политик не создаём: доступ остаётся только у владельца и service_role.

COMMENT ON TABLE public.internal_chat_policy_backup_20260811 IS
  'Слепок RLS-политик внутренних чатов до миграции 20260811_internal_chat_rls_privacy. Нужен для отката. Удалить можно через пару недель после проверки.';


-- ============================================================
-- 2. Вспомогательные функции
-- ============================================================

-- Мой employee.id. NULL, если текущий auth-пользователь не активный сотрудник.
-- is_active NULL трактуем как «активен» — колонка nullable, деактивация ставит
-- явный false (та же трактовка, что в update_sale_status_for_return и settle_sale_debt).
-- ORDER BY id — чтобы при случайном дубле сотрудника ответ был хотя бы стабильным
-- (сам дубль проверяется пунктом 4 предполётной проверки).
CREATE OR REPLACE FUNCTION public.get_user_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM public.employees
  WHERE user_id = auth.uid()
    AND COALESCE(is_active, true)
  ORDER BY id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_employee_id() IS
  'ID текущего сотрудника по auth.uid(). NULL, если пользователь не активный сотрудник. Аргументов нет — подделать снаружи нельзя. В одном ряду с get_user_role() и get_user_branch_id().';


-- Я участник этого чата? Ключевая функция: именно она разрывает рекурсию —
-- политики на internal_chat_members зовут её вместо подзапроса в саму таблицу.
CREATE OR REPLACE FUNCTION public.is_internal_chat_member(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.internal_chat_members m
    WHERE m.chat_id = p_chat_id
      AND m.employee_id = public.get_user_employee_id()
  );
$$;

COMMENT ON FUNCTION public.is_internal_chat_member(uuid) IS
  'Состоит ли текущий сотрудник в чате. SECURITY DEFINER + SET search_path — тело выполняется от владельца таблицы (RLS внутри не применяется) и не инлайнится в вызывающий запрос, поэтому вызов из политики на internal_chat_members не даёт рекурсии 42P17.';


-- Кто может ЧИТАТЬ чат: участник или админ компании (решение владельца).
CREATE OR REPLACE FUNCTION public.can_read_internal_chat(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_user_employee_id() IS NOT NULL
     AND (
       public.is_internal_chat_member(p_chat_id)
       OR public.get_user_role() = 'admin'
     );
$$;

COMMENT ON FUNCTION public.can_read_internal_chat(uuid) IS
  'Право читать внутренний чат: участник ИЛИ админ компании. Не сотрудник — всегда false.';


-- Кто может МЕНЯТЬ чат: участник, создатель или админ.
-- Создатель нужен отдельно: при создании группы строка internal_chats уже есть,
-- а строк в internal_chat_members ещё нет — иначе createGroupChat не сможет
-- добавить участников в собственный чат.
CREATE OR REPLACE FUNCTION public.can_manage_internal_chat(p_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.get_user_employee_id() IS NOT NULL
     AND (
       public.is_internal_chat_member(p_chat_id)
       OR public.get_user_role() = 'admin'
       OR EXISTS (
         SELECT 1
         FROM public.internal_chats c
         WHERE c.id = p_chat_id
           AND c.created_by = public.get_user_employee_id()
       )
     );
$$;

COMMENT ON FUNCTION public.can_manage_internal_chat(uuid) IS
  'Право менять чат (состав участников, updated_at): участник, создатель или админ. Создатель включён, чтобы createGroupChat мог добавить участников сразу после INSERT в internal_chats.';


REVOKE ALL ON FUNCTION public.get_user_employee_id()           FROM public;
REVOKE ALL ON FUNCTION public.is_internal_chat_member(uuid)    FROM public;
REVOKE ALL ON FUNCTION public.can_read_internal_chat(uuid)     FROM public;
REVOKE ALL ON FUNCTION public.can_manage_internal_chat(uuid)   FROM public;

GRANT EXECUTE ON FUNCTION public.get_user_employee_id()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_chat_member(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_internal_chat(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_internal_chat(uuid) TO authenticated;


-- ============================================================
-- 3. Снос всех действующих политик на трёх таблицах
-- ============================================================
-- Почему сносим всё, а не добавляем строгую политику рядом: политики в Postgres
-- по умолчанию PERMISSIVE и складываются по ИЛИ. Пока на internal_messages жива
-- старая `auth.uid() IS NOT NULL`, любая новая строгая политика бесполезна —
-- доступ всё равно даст старая. Имена политик в живой базе точно не известны
-- (эти таблицы заводились не миграцией из репозитория), поэтому идём циклом
-- по pg_policies. Что именно снесли — видно в таблице-слепке из шага 1.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('internal_chats', 'internal_chat_members', 'internal_messages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END;
$$;

ALTER TABLE public.internal_chats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_messages     ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 4. internal_chats
-- ============================================================
-- У всех политик явное TO authenticated: без него политика применяется и к anon,
-- у которого нет EXECUTE на функции выше — вместо пустого результата он получал бы
-- «permission denied for function». Плюс планировщик пропускает политику для
-- остальных ролей.

-- Чтение: участник, админ или создатель.
-- Создатель нужен из-за createGroupChat: там .insert().select().single() читает
-- только что созданную строку ДО того, как появились участники. Без ветки
-- created_by PostgREST вернул бы 0 строк и .single() упал бы.
CREATE POLICY internal_chats_select ON public.internal_chats
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_internal_chat(id)
    OR created_by = (SELECT public.get_user_employee_id())
  );

-- Создание: только активный сотрудник и только от своего имени
-- (created_by нельзя выставить чужой — иначе можно было бы создать чат
-- «от имени» другого сотрудника).
CREATE POLICY internal_chats_insert ON public.internal_chats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by IS NOT NULL
    AND created_by = (SELECT public.get_user_employee_id())
  );

-- Изменение: участник/создатель/админ. Нужно ровно для одного сценария —
-- sendInternalMediaMessage после вставки медиа-сообщения обновляет
-- internal_chats.updated_at (src/services/internalChat.ts:137).
-- Подмена created_by/type/id при этом заблокирована триггером ниже.
CREATE POLICY internal_chats_update ON public.internal_chats
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_internal_chat(id))
  WITH CHECK (public.can_manage_internal_chat(id));

-- Удаление: только активный админ. В UI такой кнопки нет — политика на будущее,
-- чтобы удаление не осталось «запрещено по умолчанию, а почему — непонятно».
-- Проверка на активность обязательна: без неё уволенный админ со старым JWT
-- снёс бы все внутренние чаты компании (читать он бы при этом уже не мог).
CREATE POLICY internal_chats_delete ON public.internal_chats
  FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_user_employee_id()) IS NOT NULL
    AND (SELECT public.get_user_role()) = 'admin'
  );


-- Ключевые поля чата неизменяемы. WITH CHECK политики этого выразить не может —
-- она не видит OLD, поэтому участник чата мог бы записать created_by = себе
-- (угон чата) или переделать direct в group. Триггер закрывает это для всех,
-- включая service_role: менять эти поля после создания легитимных причин нет.
-- SECURITY INVOKER (по умолчанию) — намеренно: функции не нужны чужие права.
-- search_path пинуем всё равно: через него резолвится оператор в IS DISTINCT FROM,
-- и подменённый оператор мог бы сделать проверку всегда проходящей.
CREATE OR REPLACE FUNCTION public.guard_internal_chat_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'internal_chats.id изменять нельзя';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'internal_chats.created_by изменять нельзя';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'internal_chats.type изменять нельзя';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_internal_chat_immutable() IS
  'Запрещает менять id/created_by/type у существующего чата. Политика RLS этого сделать не может — WITH CHECK не видит OLD.';

DROP TRIGGER IF EXISTS trg_internal_chats_immutable ON public.internal_chats;
CREATE TRIGGER trg_internal_chats_immutable
  BEFORE UPDATE ON public.internal_chats
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_internal_chat_immutable();


-- ============================================================
-- 5. internal_chat_members
-- ============================================================

-- Чтение состава: участник или админ. Именно здесь была рекурсия —
-- теперь проверка идёт через SECURITY DEFINER функцию, а не подзапросом
-- в эту же таблицу.
CREATE POLICY internal_chat_members_select ON public.internal_chat_members
  FOR SELECT
  TO authenticated
  USING (public.can_read_internal_chat(chat_id));

-- Добавление участников: участник/создатель/админ И только в ГРУППОВОЙ чат.
-- Ограничение по type обязательно: без него участник переписки 1-на-1 мог бы
-- добавить в неё третьего, и тот прочитал бы всю личную историю с самого начала.
-- Личные чаты создаёт только RPC create_or_get_direct_chat (SECURITY DEFINER),
-- прямой вставки в них с клиента не нужно вообще.
-- Ветка «создатель» внутри can_manage_internal_chat — то, что чинит createGroupChat.
CREATE POLICY internal_chat_members_insert ON public.internal_chat_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_internal_chat(chat_id)
    AND EXISTS (
      SELECT 1 FROM public.internal_chats c
      WHERE c.id = internal_chat_members.chat_id
        AND c.type = 'group'
    )
  );
-- Про рекурсию в этом подзапросе: он читает internal_chats обычным запросом, без
-- SECURITY DEFINER, поэтому политика internal_chats_select срабатывает. Цепочка на
-- этом обрывается: internal_chats_select зовёт can_read_internal_chat, а та —
-- SECURITY DEFINER, её чтение internal_chat_members политику уже не запускает.
-- Для createGroupChat сюда работает ветка created_by в internal_chats_select:
-- на момент вставки участников создатель ещё не участник, но строку своего чата видит.

-- Политики UPDATE НЕТ — сознательно.
-- Единственное, что здесь штатно меняется, — last_read_at, и это делает RPC
-- mark_internal_chat_read (SECURITY DEFINER, RLS обходит). Политика вида
-- «меняй свою строку» была бы дырой: она ограничивает employee_id, но не chat_id,
-- поэтому сотрудник мог бы одним UPDATE перенести свою строку членства в чужой
-- чат (employee_id остаётся своим — и USING, и WITH CHECK проходят), стать его
-- участником и прочитать всю переписку. Ровно та дыра, которую чиним.

-- Удаление: выйти можно только самому; выкинуть другого может только активный админ.
-- Создателю группы это сознательно НЕ даём — иначе рядовой сотрудник, создавший
-- группу, мог бы удалять из неё коллег.
-- Замечание: выйдя из личного чата (type='direct'), вернуться нельзя — вставка
-- участников разрешена только в группы. UI такой кнопки не даёт, но если её
-- когда-нибудь добавят, выход из личного чата надо запретить отдельно.
CREATE POLICY internal_chat_members_delete ON public.internal_chat_members
  FOR DELETE
  TO authenticated
  USING (
    employee_id = (SELECT public.get_user_employee_id())
    OR (
      (SELECT public.get_user_employee_id()) IS NOT NULL
      AND (SELECT public.get_user_role()) = 'admin'
    )
  );


-- ============================================================
-- 6. internal_messages — здесь была дыра
-- ============================================================

-- Было: USING (auth.uid() IS NOT NULL) — то есть «видно всем залогиненным».
-- Стало: видно только участнику чата или админу компании.
CREATE POLICY internal_messages_select ON public.internal_messages
  FOR SELECT
  TO authenticated
  USING (public.can_read_internal_chat(chat_id));

-- Отправка: только от своего имени и только в чат, где ты состоишь.
-- Админа сюда НЕ включаем: читать чужую переписку он вправе (решение владельца),
-- а писать в чат, участником которого не является, — нет.
-- Штатный текстовый путь идёт через RPC send_internal_message (SECURITY DEFINER),
-- эта политика нужна для sendInternalMediaMessage — она пишет напрямую
-- (src/services/internalChat.ts:131).
CREATE POLICY internal_messages_insert ON public.internal_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT public.get_user_employee_id())
    AND public.is_internal_chat_member(chat_id)
  );

-- Политик UPDATE/DELETE сознательно НЕТ: правка и удаление сообщений в UI
-- отсутствуют (проверено по CompanyChatWindow/CompanyChatList/internalChat.ts).
-- При включённом RLS без политики эти операции с клиента отклоняются.

COMMIT;


-- ============================================================
-- 7. Совместимость с уже работающим кодом
-- ============================================================
-- Существующие RPC (get_my_internal_chats, get_internal_messages,
-- send_internal_message, mark_internal_chat_read, create_or_get_direct_chat,
-- get_internal_chat_data, get_employees_for_chat, get_unread_internal_count)
-- ДОЛЖНЫ быть SECURITY DEFINER — тогда они идут в обход RLS, ни одна политика выше
-- их не касается, и личная переписка со счётчиком непрочитанных работают как сейчас.
-- Это ПРЕДПОЛОЖЕНИЕ, а не факт: тел функций в репозитории нет (база собрана через
-- MCP). Проверяется пунктом 3a предполётной проверки, и проверить надо обязательно —
-- политики ниже рассчитаны на то, что штатные пути идут мимо RLS.
--
-- Прямые обращения из клиента, затронутые новыми политиками:
--   createGroupChat()          insert internal_chats    -> internal_chats_insert
--                              select обратно           -> internal_chats_select (ветка created_by)
--                              insert участников        -> internal_chat_members_insert (ветка создателя, type='group')
--   sendInternalMediaMessage() insert internal_messages -> internal_messages_insert
--                              select обратно           -> internal_messages_select (участник)
--                              update internal_chats    -> internal_chats_update (меняется только updated_at)
--
-- Realtime (postgres_changes) уважает RLS: после применения сотрудник перестанет
-- получать события о сообщениях в чужих чатах — это и есть цель. Побочный
-- эффект: у админа подписка в App.tsx:407 по-прежнему будет реагировать на ВСЕ
-- сообщения компании (он их теперь легально видит), то есть звук уведомления у
-- админа будет срабатывать на чужую переписку. Это поведение UI, не RLS;
-- правится отдельной задачей, если мешает.


-- ============================================================
-- 8. ОСТАЮЩАЯСЯ ДЫРА — эта миграция её НЕ закрывает
-- ============================================================
-- Все RPC внутреннего чата — SECURITY DEFINER (обходят RLS) и принимают id
-- СНАРУЖИ, из браузера:
--   get_internal_messages(p_chat_id, p_limit)          — любой чат по его id
--   get_my_internal_chats(p_employee_id)               — чужой список чатов
--   get_unread_internal_count(p_employee_id)
--   send_internal_message(p_chat_id, p_sender_id, ...) — отправка от чужого имени
--   mark_internal_chat_read(p_chat_id, p_employee_id)
--   create_or_get_direct_chat(p_employee1_id, p_employee2_id)
--
-- Если внутри них нет проверки прав (тела функций в репозитории отсутствуют —
-- их надо посмотреть в базе), то сотрудник по-прежнему читает чужую переписку,
-- просто через rpc(), а не from(). Цепочка полностью рабочая: id сотрудников
-- отдаёт get_employees_for_chat, по ним get_my_internal_chats даёт id чатов,
-- по ним get_internal_messages — сами сообщения.
--
-- Посмотреть тела:
--   SELECT proname, prosecdef, pg_get_functiondef(oid)
--   FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('get_my_internal_chats','get_internal_messages','send_internal_message',
--                     'mark_internal_chat_read','create_or_get_direct_chat','get_internal_chat_data',
--                     'get_employees_for_chat','get_unread_internal_count');
--
-- Лечится тем же приёмом, что в 20260810_return_rpc_auth_guard.sql: внутри каждой
-- функции брать сотрудника из auth.uid() (get_user_employee_id()), а не из
-- параметра, и отказывать не-участнику (админу — разрешать чтение).
-- Заведено отдельной задачей в TASKS.md.
--
-- Смежное, тоже вне этой миграции: медиа лежит в Storage-бакете chat-media,
-- RLS на строке сообщения файл не закрывает. Проверить:
--   SELECT id, public FROM storage.buckets WHERE id = 'chat-media';
-- Если бакет public — ссылка на вложение открывается кем угодно.


-- ============================================================
-- 9. Проверка после применения
-- ============================================================
-- 1) Рекурсии нет (раньше падало 42P17):
--      SELECT count(*) FROM internal_chat_members;
--      SELECT count(*) FROM internal_chats;
--
-- 2) Под сессией обычного сотрудника (НЕ админа), не состоящего в чате X:
--      SELECT count(*) FROM internal_messages WHERE chat_id = 'X';   -- ожидаем 0
--
-- 3) Под сессией админа тот же запрос — ожидаем реальное количество сообщений.
--
-- 4) Попытка угона (должна упасть или дать 0 строк) под обычным сотрудником:
--      UPDATE internal_chat_members SET chat_id = '<чужой чат>' WHERE employee_id = '<я>';
--      UPDATE internal_chats SET created_by = '<я>' WHERE id = '<чужой чат>';
--
-- 5) В UI: создать групповой чат (кнопка «Создать группу» в списке
--    корпоративных чатов) — раньше падало, теперь должно создаться;
--    отправить в него текст и фото; проверить, что пуш о новом сообщении дошёл.

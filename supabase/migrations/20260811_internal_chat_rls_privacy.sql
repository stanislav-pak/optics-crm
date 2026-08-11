-- ============================================================
-- Внутренние чаты: снятие рекурсии RLS (42P17) + закрытие дыры приватности
-- Дата: 2026-08-11
-- Таблицы: internal_chats, internal_chat_members, internal_messages
--
-- Предполётная проверка выполнена против прода toxspgdkvxmpsvtecesy 2026-08-11,
-- фактические результаты — в разделе «ЧТО ПОКАЗАЛА ЖИВАЯ БАЗА» ниже.
--
-- ------------------------------------------------------------
-- ПРОБЛЕМА 1 — рекурсия (ошибка 42P17)
-- ------------------------------------------------------------
-- Политика select_internal_chat_members на internal_chat_members внутри себя
-- делала подзапрос к той же internal_chat_members (подтверждено на проде):
--   (employee_id = get_employee_id())
--   OR (get_user_role() = 'admin')
--   OR EXISTS (SELECT 1 FROM internal_chat_members m2
--              WHERE m2.chat_id = internal_chat_members.chat_id
--                AND m2.employee_id = get_employee_id())
-- Postgres при проверке строки запускает политику, та снова читает таблицу,
-- снова запускается политика — «infinite recursion detected in policy».
-- Та же беда у members_see_internal_chats на internal_chats — она тоже читает
-- internal_chat_members и, значит, натыкается на рекурсивную политику.
-- Следствие: createGroupChat() (src/services/internalChat.ts:78) — единственное
-- место, пишущее в эти таблицы напрямую, минуя RPC, — падал всегда.
-- В базе 0 групповых чатов (подтверждено: group_chats = 0).
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
-- Политика employees_see_internal_messages на internal_messages была буквально
-- `auth.uid() IS NOT NULL` (подтверждено на проде): любой залогиненный сотрудник
-- прямым запросом supabase.from('internal_messages') читал переписку всех
-- остальных, включая личную 1-на-1.
--
-- Дыра была шире, чем казалось: insert_internal_chat_members имела
-- WITH CHECK (true), то есть любой мог вписать себя (или кого угодно) в любой
-- чат. И members_insert_internal_chats — тоже WITH CHECK (true), то есть чат
-- можно было создать от чужого имени. Обе закрываются здесь же.
--
-- РЕШЕНИЕ (согласовано с владельцем): сообщение видно только участнику чата
-- ИЛИ администратору компании. То же правило на internal_chats и
-- internal_chat_members.
--
-- ------------------------------------------------------------
-- ЦЕНТРАЛЬНЫЕ ФУНКЦИИ ПРОЕКТА — используем существующие, своих не плодим
-- ------------------------------------------------------------
--   get_employee_id()     -> uuid  «мой employees.id»
--   get_user_role()       -> text  «моя роль»
--   get_user_branch_id()  -> uuid  «мой филиал» (здесь не нужна)
-- Все три SECURITY DEFINER STABLE, живут в базе (в supabase/migrations/ их нет —
-- репозиторий содержит лишь часть объектов базы). get_employee_id() и
-- get_user_role() уже используются в 8 политиках (внутренние чаты, reminders,
-- tasks), поэтому свою копию «кто я» и «какая у меня роль» здесь СПЕЦИАЛЬНО не
-- заводим: два независимых ответа на один вопрос рано или поздно разойдутся.
--
-- ВАЖНОЕ СВОЙСТВО обеих: они НЕ фильтруют is_active —
--   SELECT id   FROM employees WHERE user_id = auth.uid() LIMIT 1;
--   SELECT role FROM employees WHERE user_id = auth.uid() LIMIT 1;
-- То есть уволенный сотрудник с ещё живым JWT продолжает «быть собой» и
-- сохраняет роль (деактивация в UI только разлогинивает, токен против PostgREST
-- работает). Менять сами функции здесь НЕЛЬЗЯ — они завязаны на 8 политик в
-- посторонних таблицах, это отдельная задача с отдельной проверкой.
-- Поэтому добавляем ОДИН новый предикат is_active_employee() — он не дублирует
-- «кто я», а отвечает на другой вопрос, которого в проекте не было, — и ставим
-- его первым условием во все проверки доступа к чатам. Фильтр строгий: доступ к
-- переписке уволенный теряет сразу.
--
-- ------------------------------------------------------------
-- ПРО «ИЗОЛЯЦИЮ ПО ОРГАНИЗАЦИИ»
-- ------------------------------------------------------------
-- Мультиарендности в этой базе нет: ни таблицы organizations, ни колонок
-- organization_id/org_id. Вся база = одна компания New Line; внутри неё изоляция
-- идёт по branch_id, а «свой/чужой» — по employees.user_id = auth.uid().
-- Роль «границы организации» здесь играет is_active_employee(): для любого, кто
-- не активный сотрудник этой базы, он даёт false, и ВСЕ политики ниже дают false
-- (fail-closed). Посторонний не получает ничего.
--
-- По филиалам внутренние чаты НЕ режем сознательно: это общекорпоративный чат,
-- сотрудники разных филиалов должны переписываться (getAllEmployees() отдаёт
-- сотрудников всех филиалов через get_employees_for_chat).
--
-- Ни одна функция ниже не принимает id сотрудника или роль снаружи — только
-- auth.uid() из текущей сессии. Клиент не может подделать «я админ».
--
-- ------------------------------------------------------------
-- ЧТО ПОКАЗАЛА ЖИВАЯ БАЗА (предполёт, прод, 2026-08-11)
-- ------------------------------------------------------------
--  1. Политики до миграции: 7 штук, все TO public. Полный слепок сохранён
--     в таблицу internal_chat_policy_backup_20260811 (шаг 1 ниже).
--     Политик DELETE не было ни на одной из трёх таблиц.
--  2. relforcerowsecurity = false у всех трёх, владелец postgres. ОК —
--     SECURITY DEFINER действительно обходит RLS, рекурсия рвётся.
--  3. get_user_role, get_user_branch_id, get_employee_id — существуют,
--     prosecdef = true. Имена новых функций свободны.
-- 3a. Все 8 RPC внутреннего чата — prosecdef = true. ОК, штатные пути идут
--     мимо RLS и эта миграция их не задевает.
--  4. Дублей employees на один user_id нет (0 строк).
--  5. Триггер пушей trigger_push_internal_message -> notify_push_internal_message,
--     prosecdef = true. ОК, новые политики его чтения не отфильтруют.
--  6. Индексы на internal_chat_members: UNIQUE (chat_id, employee_id) +
--     idx_internal_chat_members_employee (employee_id). Хватает.
--     Триггеров на internal_chats нет — новый guard-триггер ни с чем не конфликтует.
--     Объём: 2 чата (групповых 0), 4 участника, 1 сообщение.
--
-- ------------------------------------------------------------
-- ВНИМАНИЕ ПРО ПРИМЕНЕНИЕ
-- ------------------------------------------------------------
-- supabase/.temp/linked-project.json в этом репозитории указывает на ЧУЖОЙ
-- проект (htqqxmqbamfjzahkwuuz «Saldo Beauty»), а не на toxspgdkvxmpsvtecesy.
-- `supabase db push` отсюда уйдёт не в ту базу и потащит все остальные файлы из
-- supabase/migrations/. Применять только точечно: SQL-редактор нужного проекта
-- или Management API с явным project ref.
-- ============================================================


BEGIN;

-- Быстрый отказ, если центральных функций в базе вдруг нет — лучше упасть здесь,
-- чем создать политики, которые ничего не проверяют.
DO $$
BEGIN
  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION 'Нет функции public.get_user_role() — миграция рассчитана на неё.';
  END IF;
  IF to_regprocedure('public.get_employee_id()') IS NULL THEN
    RAISE EXCEPTION 'Нет функции public.get_employee_id() — миграция рассчитана на неё.';
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
-- «Кто я» и «моя роль» НЕ переопределяем — берём существующие get_employee_id()
-- и get_user_role(). Ниже только то, чего в проекте не было.

-- Активен ли текущий сотрудник. Отдельный предикат, а не ещё одна версия «кто я»:
-- get_employee_id() и get_user_role() is_active не смотрят, а трогать их нельзя —
-- на них висят политики reminders/tasks и другие.
-- is_active NULL трактуем как «активен»: колонка nullable, деактивация ставит
-- явный false (та же трактовка, что в update_sale_status_for_return и settle_sale_debt).
CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees
    WHERE user_id = auth.uid()
      AND COALESCE(is_active, true)
  );
$$;

COMMENT ON FUNCTION public.is_active_employee() IS
  'Является ли текущий auth-пользователь активным сотрудником. Дополняет get_employee_id()/get_user_role(), которые is_active не проверяют (и которые здесь трогать нельзя — на них завязаны политики reminders/tasks).';


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
      AND m.employee_id = public.get_employee_id()
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
  SELECT public.is_active_employee()
     AND (
       public.is_internal_chat_member(p_chat_id)
       OR public.get_user_role() = 'admin'
     );
$$;

COMMENT ON FUNCTION public.can_read_internal_chat(uuid) IS
  'Право читать внутренний чат: активный сотрудник, который либо участник, либо админ компании.';


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
  SELECT public.is_active_employee()
     AND (
       public.is_internal_chat_member(p_chat_id)
       OR public.get_user_role() = 'admin'
       OR EXISTS (
         SELECT 1
         FROM public.internal_chats c
         WHERE c.id = p_chat_id
           AND c.created_by = public.get_employee_id()
       )
     );
$$;

COMMENT ON FUNCTION public.can_manage_internal_chat(uuid) IS
  'Право менять чат (состав участников, updated_at): активный сотрудник — участник, создатель или админ. Создатель включён, чтобы createGroupChat мог добавить участников сразу после INSERT в internal_chats.';


REVOKE ALL ON FUNCTION public.is_active_employee()             FROM public;
REVOKE ALL ON FUNCTION public.is_internal_chat_member(uuid)    FROM public;
REVOKE ALL ON FUNCTION public.can_read_internal_chat(uuid)     FROM public;
REVOKE ALL ON FUNCTION public.can_manage_internal_chat(uuid)   FROM public;

GRANT EXECUTE ON FUNCTION public.is_active_employee()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_internal_chat_member(uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_internal_chat(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_internal_chat(uuid) TO authenticated;


-- ============================================================
-- 3. Снос всех действующих политик на трёх таблицах
-- ============================================================
-- Почему сносим всё, а не добавляем строгую политику рядом: политики в Postgres
-- по умолчанию PERMISSIVE и складываются по ИЛИ. Пока на internal_messages жива
-- старая `auth.uid() IS NOT NULL`, любая новая строгая политика бесполезна —
-- доступ всё равно даст старая. Идём циклом по pg_policies, чтобы ничего не
-- пропустить; что именно снесли, видно в таблице-слепке из шага 1.

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
-- У всех политик явное TO authenticated: без него политика применяется и к anon
-- (старые политики были TO public). Плюс планировщик пропускает её для остальных
-- ролей. service_role RLS обходит в любом случае.
--
-- Политику DELETE НЕ создаём: до миграции её не было, UI удаления чатов не
-- имеет — новых прав на проде не выдаём. Без политики DELETE с клиента отклоняется.

-- Чтение: участник, админ или создатель.
-- Создатель нужен из-за createGroupChat: там .insert().select().single() читает
-- только что созданную строку ДО того, как появились участники. Без ветки
-- created_by PostgREST вернул бы 0 строк и .single() упал бы.
-- (В старой политике members_see_internal_chats эта ветка тоже была — сохраняем.)
CREATE POLICY internal_chats_select ON public.internal_chats
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_internal_chat(id)
    OR (public.is_active_employee() AND created_by = (SELECT public.get_employee_id()))
  );

-- Создание: только активный сотрудник и только от своего имени.
-- Было WITH CHECK (true) — то есть чат можно было создать от чужого имени.
CREATE POLICY internal_chats_insert ON public.internal_chats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_employee()
    AND created_by IS NOT NULL
    AND created_by = (SELECT public.get_employee_id())
  );

-- Изменение: участник/создатель/админ. Нужно ровно для одного сценария —
-- sendInternalMediaMessage после вставки медиа-сообщения обновляет
-- internal_chats.updated_at (src/services/internalChat.ts:137). Старая политика
-- пускала только создателя и админа, из-за чего у обычного участника этот
-- апдейт молча не проходил (код ошибку не проверяет).
-- Подмена created_by/type/id при этом заблокирована триггером ниже.
CREATE POLICY internal_chats_update ON public.internal_chats
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_internal_chat(id))
  WITH CHECK (public.can_manage_internal_chat(id));


-- Ключевые поля чата неизменяемы. WITH CHECK политики этого выразить не может —
-- она не видит OLD, поэтому участник чата мог бы записать created_by = себе
-- (угон чата) или переделать direct в group. Триггер закрывает это для всех,
-- включая service_role: менять эти поля после создания легитимных причин нет.
-- Своих триггеров на internal_chats до этой миграции не было (проверено).
-- SECURITY INVOKER (по умолчанию) — намеренно: чужие права функции не нужны.
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
-- Политику DELETE не создаём — её не было и UI её не требует.
-- Политику UPDATE не создаём — см. развёрнутое обоснование ниже.

-- Чтение состава: участник или админ. Именно здесь была рекурсия —
-- теперь проверка идёт через SECURITY DEFINER функцию, а не подзапросом
-- в эту же таблицу.
CREATE POLICY internal_chat_members_select ON public.internal_chat_members
  FOR SELECT
  TO authenticated
  USING (public.can_read_internal_chat(chat_id));

-- Добавление участников: участник/создатель/админ И только в ГРУППОВОЙ чат.
-- Было WITH CHECK (true) — любой мог вписать себя в любой чат и читать его.
-- Ограничение по type обязательно: без него участник переписки 1-на-1 мог бы
-- добавить в неё третьего, и тот прочитал бы всю личную историю с самого начала.
-- Личные чаты создаёт только RPC create_or_get_direct_chat (SECURITY DEFINER,
-- проверено), прямой вставки в них с клиента не нужно вообще.
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

-- Политики UPDATE НЕТ — сознательно, и это не упущение.
-- Единственное, что здесь штатно меняется, — last_read_at, и это делает RPC
-- mark_internal_chat_read (SECURITY DEFINER, проверено на проде: prosecdef = true),
-- то есть мимо RLS. Политика вида «меняй свою строку» была бы дырой: она
-- ограничивает employee_id, но не chat_id, поэтому сотрудник мог бы одним UPDATE
-- перенести свою строку членства в чужой чат (employee_id остаётся своим — и
-- USING, и WITH CHECK проходят), стать его участником и прочитать всю переписку.
-- Ровно та дыра, которую чиним.


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
-- Было WITH CHECK (sender_id = get_employee_id()) — от своего имени, но в ЛЮБОЙ
-- чат, включая чужой личный. Добавлена проверка членства.
-- Админа сюда НЕ включаем: читать чужую переписку он вправе (решение владельца),
-- а писать в чат, участником которого не является, — нет.
-- Штатный текстовый путь идёт через RPC send_internal_message (SECURITY DEFINER),
-- эта политика нужна для sendInternalMediaMessage — она пишет напрямую
-- (src/services/internalChat.ts:131).
CREATE POLICY internal_messages_insert ON public.internal_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_employee()
    AND sender_id = (SELECT public.get_employee_id())
    AND public.is_internal_chat_member(chat_id)
  );

-- Политик UPDATE/DELETE сознательно НЕТ: правка и удаление сообщений в UI
-- отсутствуют (проверено по CompanyChatWindow/CompanyChatList/internalChat.ts),
-- до миграции их тоже не было.

COMMIT;


-- ============================================================
-- 7. Совместимость с уже работающим кодом
-- ============================================================
-- Все 8 RPC внутреннего чата (get_my_internal_chats, get_internal_messages,
-- send_internal_message, mark_internal_chat_read, create_or_get_direct_chat,
-- get_internal_chat_data, get_employees_for_chat, get_unread_internal_count) —
-- SECURITY DEFINER, проверено на проде. Они идут в обход RLS, ни одна политика
-- выше их не касается: личная переписка и счётчик непрочитанных работают как прежде.
--
-- Прямые обращения из клиента, затронутые новыми политиками:
--   createGroupChat()          insert internal_chats    -> internal_chats_insert
--                              select обратно           -> internal_chats_select (ветка created_by)
--                              insert участников        -> internal_chat_members_insert (ветка создателя, type='group')
--   sendInternalMediaMessage() insert internal_messages -> internal_messages_insert
--                              select обратно           -> internal_messages_select (участник)
--                              update internal_chats    -> internal_chats_update (меняется только updated_at)
--
-- Realtime (postgres_changes) уважает RLS и подключается ролью authenticated:
-- после применения сотрудник перестанет получать события о сообщениях в чужих
-- чатах — это и есть цель. Побочный эффект: у админа подписка в App.tsx:407
-- по-прежнему будет реагировать на ВСЕ сообщения компании (он их теперь легально
-- видит), то есть звук уведомления у админа сработает и на чужую переписку.
-- Это поведение UI, не RLS; правится отдельной задачей, если мешает.


-- ============================================================
-- 8. ОСТАЮЩАЯСЯ ДЫРА — эта миграция её НЕ закрывает
-- ============================================================
-- Все RPC внутреннего чата — SECURITY DEFINER (обходят RLS) и принимают id
-- СНАРУЖИ, из браузера (сигнатуры подтверждены на проде):
--   get_internal_messages(p_chat_id uuid, p_limit int)         — любой чат по его id
--   get_my_internal_chats(p_employee_id uuid)                  — чужой список чатов
--   get_unread_internal_count(p_employee_id uuid)
--   send_internal_message(p_chat_id, p_sender_id, p_content)   — отправка от чужого имени
--   mark_internal_chat_read(p_chat_id, p_employee_id)
--   create_or_get_direct_chat(p_employee1_id, p_employee2_id)
--
-- Если внутри них нет проверки прав, сотрудник по-прежнему читает чужую переписку —
-- просто через rpc(), а не from(). Цепочка полностью рабочая: id сотрудников
-- отдаёт get_employees_for_chat, по ним get_my_internal_chats даёт id чатов,
-- по ним get_internal_messages — сами сообщения.
--
-- Лечится тем же приёмом, что в 20260810_return_rpc_auth_guard.sql: внутри каждой
-- функции брать сотрудника из auth.uid() (get_employee_id()), а не из параметра,
-- и отказывать не-участнику (админу — разрешать чтение).
-- Заведено отдельной задачей T83 в TASKS.md.
--
-- Смежное, тоже вне этой миграции: медиа лежит в Storage-бакете chat-media,
-- RLS на строке сообщения файл не закрывает. Проверить:
--   SELECT id, public FROM storage.buckets WHERE id = 'chat-media';


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
-- 4) Попытка угона под обычным сотрудником — должна упасть или дать 0 строк:
--      UPDATE internal_chats SET created_by = '<я>' WHERE id = '<чужой чат>';
--      INSERT INTO internal_chat_members (chat_id, employee_id)
--        VALUES ('<чужой личный чат>', '<я>');
--
-- 5) В UI: создать групповой чат (кнопка «Создать группу» в списке
--    корпоративных чатов) — раньше падало, теперь должно создаться;
--    отправить в него текст и фото; проверить, что пуш дошёл.

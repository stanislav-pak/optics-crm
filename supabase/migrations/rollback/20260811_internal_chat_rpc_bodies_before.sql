-- ============================================================
-- ОТКАТ для 20260811_internal_chat_rpc_auth_guards.sql
-- ============================================================
-- Это ТОЧНЫЙ СЛЕПОК тел восьми RPC внутреннего чата, каким он был на живой базе
-- toxspgdkvxmpsvtecesy 2026-08-11 ДО применения миграции с проверками прав.
-- Снят через pg_get_functiondef(), не редактировался (добавлены только точки
-- с запятой после $function$ — их в выводе pg_get_functiondef нет).
--
-- ЗАЧЕМ ЭТОТ ФАЙЛ. Тела функций в этом проекте живут только в базе, в git их нет.
-- Если бы отката не было, вернуть прежнее поведение после неудачного применения
-- было бы неоткуда. Предыдущая миграция (20260811_internal_chat_rls_privacy)
-- по той же причине сохраняла слепок политик в таблицу.
--
-- !!! ВНИМАНИЕ !!!
-- Применение этого файла ВОЗВРАЩАЕТ ДЫРУ ПРИВАТНОСТИ. Эти тела не проверяют
-- права вообще: любой может читать чужую переписку и слать сообщения от чужого
-- имени. Запускать только как аварийный откат, если после миграции сломался
-- рабочий процесс, и сразу заводить задачу на повторное закрытие.
--
-- Гранты этот файл НЕ восстанавливает (см. раздел в конце) — снятие EXECUTE
-- у anon ничего не ломает и откатывать его не нужно.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_or_get_direct_chat(p_employee1_id uuid, p_employee2_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_chat_id UUID;
BEGIN
  SELECT m1.chat_id INTO v_chat_id
  FROM internal_chat_members m1
  JOIN internal_chat_members m2 
    ON m2.chat_id = m1.chat_id 
    AND m2.employee_id = p_employee2_id
  JOIN internal_chats c 
    ON c.id = m1.chat_id 
    AND c.type = 'direct'
  WHERE m1.employee_id = p_employee1_id
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  INSERT INTO internal_chats (type, created_by)
  VALUES ('direct', p_employee1_id)
  RETURNING id INTO v_chat_id;

  INSERT INTO internal_chat_members (chat_id, employee_id)
  VALUES (v_chat_id, p_employee1_id), (v_chat_id, p_employee2_id);

  RETURN v_chat_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_employees_for_chat()
 RETURNS TABLE(id uuid, name text, role text, branch_id uuid, branch_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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


CREATE OR REPLACE FUNCTION public.get_internal_chat_data(p_chat_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
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


CREATE OR REPLACE FUNCTION public.get_internal_messages(p_chat_id uuid, p_limit integer DEFAULT 50)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result JSON;
BEGIN
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


CREATE OR REPLACE FUNCTION public.get_my_internal_chats(p_employee_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
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
            ON my_m.chat_id = c.id AND my_m.employee_id = p_employee_id
          WHERE msg.chat_id = c.id
          AND (my_m.last_read_at IS NULL OR msg.created_at > my_m.last_read_at)
          AND msg.sender_id != p_employee_id
        )
      ) as chat_data,
      c.updated_at as last_msg_at
    FROM internal_chats c
    JOIN internal_chat_members m ON m.chat_id = c.id AND m.employee_id = p_employee_id
  ) sub;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_unread_internal_count(p_employee_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM internal_messages m
  JOIN internal_chat_members mem 
    ON mem.chat_id = m.chat_id
    AND mem.employee_id = p_employee_id
  WHERE m.sender_id != p_employee_id
  AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at);
  
  RETURN COALESCE(v_count, 0);
END;
$function$;


CREATE OR REPLACE FUNCTION public.mark_internal_chat_read(p_chat_id uuid, p_employee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE internal_chat_members
  SET last_read_at = NOW()
  WHERE chat_id = p_chat_id
  AND employee_id = p_employee_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.send_internal_message(p_chat_id uuid, p_sender_id uuid, p_content text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_message_id UUID;
  v_result JSON;
BEGIN
  INSERT INTO internal_messages (chat_id, sender_id, content)
  VALUES (p_chat_id, p_sender_id, p_content)
  RETURNING id INTO v_message_id;

  UPDATE internal_chats SET updated_at = NOW() WHERE id = p_chat_id;

  UPDATE internal_chat_members
  SET last_read_at = NOW()
  WHERE chat_id = p_chat_id AND employee_id = p_sender_id;

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
COMMIT;


-- ============================================================
-- Восстановление грантов — ТОЛЬКО ЕСЛИ ДЕЙСТВИТЕЛЬНО НУЖНО
-- ============================================================
-- До миграции у всех девяти функций был EXECUTE у роли anon, то есть их можно
-- было звать публичным ключом без входа в систему. Это и есть дыра, откатывать
-- её незачем: приложение ходит под authenticated и без anon работает.
-- Строки ниже намеренно закомментированы. Раскомментировать только если
-- выяснится, что какой-то legacy-вызов ходит без авторизации.
--
-- GRANT EXECUTE ON FUNCTION public.get_employees_for_chat()                TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_my_internal_chats(uuid)             TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_unread_internal_count(uuid)         TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_internal_messages(uuid, integer)    TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_internal_chat_data(uuid)            TO anon;
-- GRANT EXECUTE ON FUNCTION public.send_internal_message(uuid, uuid, text) TO anon;
-- GRANT EXECUTE ON FUNCTION public.mark_internal_chat_read(uuid, uuid)     TO anon;
-- GRANT EXECUTE ON FUNCTION public.create_or_get_direct_chat(uuid, uuid)   TO anon;
-- GRANT EXECUTE ON FUNCTION public.get_total_unread_for_employee(uuid)     TO anon, authenticated;

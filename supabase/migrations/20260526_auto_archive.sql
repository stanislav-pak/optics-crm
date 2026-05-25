-- ============================================================
-- Migration: auto-archive chats
-- 2026-05-26
-- ============================================================

-- 1. Новая колонка: время после которого чат архивируется
ALTER TABLE chats ADD COLUMN IF NOT EXISTS archive_after TIMESTAMPTZ;

-- ============================================================
-- 2. Функция-триггер: устанавливает archive_after при закрытии сделки
-- ============================================================
CREATE OR REPLACE FUNCTION set_archive_after()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_stage = 'closed' THEN
    UPDATE chats
    SET archive_after = NOW() + INTERVAL '24 hours'
    WHERE id = NEW.chat_id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Триггер: срабатывает при любом INSERT в deal_stages
DROP TRIGGER IF EXISTS trigger_set_archive_after ON deal_stages;
CREATE TRIGGER trigger_set_archive_after
  AFTER INSERT ON deal_stages
  FOR EACH ROW EXECUTE FUNCTION set_archive_after();

-- ============================================================
-- 4. Основная функция архивации (вызывается pg_cron и Edge Function)
-- ============================================================
CREATE OR REPLACE FUNCTION auto_archive_chats(
  p_archive_closed   BOOLEAN DEFAULT TRUE,
  p_archive_inactive BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed_count   INTEGER := 0;
  v_inactive_count INTEGER := 0;
BEGIN
  -- Архивируем закрытые сделки (у которых истёк 24-часовой grace period)
  IF p_archive_closed THEN
    WITH updated AS (
      UPDATE chats
      SET status     = 'archived',
          updated_at = NOW()
      WHERE archive_after IS NOT NULL
        AND archive_after < NOW()
        AND status = 'active'
      RETURNING id
    )
    SELECT COUNT(*) INTO v_closed_count FROM updated;
  END IF;

  -- Архивируем чаты без активности 30+ дней
  IF p_archive_inactive THEN
    WITH updated AS (
      UPDATE chats
      SET status     = 'archived',
          updated_at = NOW()
      WHERE (
        last_message_at < NOW() - INTERVAL '30 days'
        OR (last_message_at IS NULL AND created_at < NOW() - INTERVAL '30 days')
      )
        AND status = 'active'
      RETURNING id
    )
    SELECT COUNT(*) INTO v_inactive_count FROM updated;
  END IF;

  RETURN jsonb_build_object(
    'archived_closed',   v_closed_count,
    'archived_inactive', v_inactive_count,
    'archived_total',    v_closed_count + v_inactive_count
  );
END;
$$;

-- ============================================================
-- 5. pg_cron: запускать каждый час (требует расширение pg_cron)
-- ============================================================
-- Включить расширение (если ещё не включено):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Удалить старое задание если есть, затем создать новое
SELECT cron.unschedule('auto-archive-chats') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-archive-chats'
);

SELECT cron.schedule(
  'auto-archive-chats',               -- уникальное имя задания
  '0 * * * *',                        -- каждый час в :00
  $$ SELECT auto_archive_chats(TRUE, TRUE) $$
);

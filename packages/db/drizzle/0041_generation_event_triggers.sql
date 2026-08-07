-- P1-32: outbox 触发器 DDL 收敛进迁移链（此前只在 API 启动钩子
-- ensureGenerationEventsTrigger 安装）。纯 migrate 环境（无 API 启动）现在也
-- 具备完整的 outbox 捕获 / 通知触发器；启动钩子保留为幂等 ensure 兜底。
-- DDL 与 packages/generation-repository/src/notify.ts 保持一致（同一处同步改）。
--> statement-breakpoint
CREATE OR REPLACE FUNCTION append_generation_status_event() RETURNS trigger AS $$
DECLARE
  event_id text;
BEGIN
  event_id := 'generation_event_' || md5(random()::text || clock_timestamp()::text || NEW.id);
  INSERT INTO generation_events (id, record_id, user_id, status, model_id, updated_at, created_at)
  VALUES (
    event_id,
    NEW.id,
    NEW.user_id,
    NEW.status,
    NEW.model_id,
    NEW.updated_at,
    date_trunc('milliseconds', clock_timestamp())
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_generation_events() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'generation_events',
    json_build_object(
      'id', NEW.id,
      'recordId', NEW.record_id,
      'userId', NEW.user_id,
      'status', NEW.status,
      'modelId', NEW.model_id,
      'updatedAt', NEW.updated_at,
      'createdAt', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
--> statement-breakpoint
DROP TRIGGER IF EXISTS generation_status_event_capture ON generation_records;
--> statement-breakpoint
DROP TRIGGER IF EXISTS generation_events_notify ON generation_records;
--> statement-breakpoint
CREATE TRIGGER generation_status_event_capture
AFTER UPDATE OF status ON generation_records
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION append_generation_status_event();
--> statement-breakpoint
DROP TRIGGER IF EXISTS generation_events_notify ON generation_events;
--> statement-breakpoint
CREATE TRIGGER generation_events_notify
AFTER INSERT ON generation_events
FOR EACH ROW
EXECUTE FUNCTION notify_generation_events();

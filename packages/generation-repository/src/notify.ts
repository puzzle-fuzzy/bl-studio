/**
 * 生成事件 outbox DDL。
 *
 * 触发器归属在 generation repository 边界：它把生成状态流转捕获进持久化
 * outbox，并发出 NOTIFY 唤醒提示。数据库包只负责通用的 LISTEN/NOTIFY 传输。
 */
import postgres from 'postgres'

/**
 * 幂等地安装「生成状态捕获」与「outbox 通知」触发器。
 *
 * P1-32：触发器 DDL 已收敛进迁移链（0041_generation_event_triggers），纯 migrate
 * 环境即可获得完整触发器；这里保留为幂等 ensure 兜底——对老库/手工漂移补装，
 * 对已装环境是 CREATE OR REPLACE + DROP TRIGGER IF EXISTS 的无害重放。
 * 改 DDL 时须与迁移文件同步修改（drizzle 不追踪 trigger 表达式）。
 */
export async function ensureGenerationEventsTrigger(connectionString: string): Promise<void> {
  const sql = postgres(connectionString, { max: 1 })
  try {
    await sql`
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
    `
    await sql`
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
    `
    await sql`DROP TRIGGER IF EXISTS generation_status_event_capture ON generation_records`
    // `notify_generation_events` 从 outbox 行读取 record_id。在把两个触发器
    // 重建到各自目标表之前，先移除 generation_records 上的遗留副本；否则
    // 处理错误行时状态更新会报 `record "new" has no field "record_id"`。
    await sql`DROP TRIGGER IF EXISTS generation_events_notify ON generation_records`
    await sql`
      CREATE TRIGGER generation_status_event_capture
      AFTER UPDATE OF status ON generation_records
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION append_generation_status_event()
    `
    await sql`DROP TRIGGER IF EXISTS generation_events_notify ON generation_events`
    await sql`
      CREATE TRIGGER generation_events_notify
      AFTER INSERT ON generation_events
      FOR EACH ROW
      EXECUTE FUNCTION notify_generation_events()
    `
  } finally {
    await sql.end()
  }
}

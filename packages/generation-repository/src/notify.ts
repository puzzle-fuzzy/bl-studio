/**
 * Generation event outbox DDL.
 *
 * The trigger belongs to the generation repository boundary: it captures
 * generation status transitions into the durable outbox and emits a NOTIFY
 * wake-up hint. The database package remains responsible only for generic
 * LISTEN/NOTIFY transport.
 */
import postgres from 'postgres'

/**
 * Idempotently install the generation status capture and outbox notification
 * triggers. This is invoked during API startup because schema push workflows
 * do not install executable trigger DDL.
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
    // `notify_generation_events` reads record_id from the outbox row. Remove
    // any legacy copy on generation_records before recreating the two triggers
    // on their intended tables; otherwise a status update fails with
    // `record "new" has no field "record_id"` while handling the wrong row.
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

#!/usr/bin/env bash
# 在临时 PostgreSQL 容器中演练 plain SQL gzip 备份恢复。
# 不读取 DATABASE_URL，不连接生产数据库，也不覆盖任何持久化卷。
set -euo pipefail

BACKUP_FILE="${1:-}"
RESTORE_DB_USER="${RESTORE_DB_USER:-bailian-studio}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"

if [[ -z "$BACKUP_FILE" || "$BACKUP_FILE" == "--help" ]]; then
  echo "用法：infra/scripts/restore-rehearsal.sh <backup.sql.gz>" >&2
  exit 2
fi
[[ -f "$BACKUP_FILE" ]] || { echo "备份文件不存在：$BACKUP_FILE" >&2; exit 1; }
gzip -t "$BACKUP_FILE"

container="bailian-studio-restore-rehearsal-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> 启动临时 PostgreSQL（容器：$container）"
docker run -d --rm \
  --name "$container" \
  -e "POSTGRES_USER=$RESTORE_DB_USER" \
  -e 'POSTGRES_PASSWORD=restore-rehearsal-only' \
  -e 'POSTGRES_DB=restore_rehearsal' \
  "$POSTGRES_IMAGE" >/dev/null

ready=""
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U "$RESTORE_DB_USER" -d restore_rehearsal >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ -n "$ready" ]] || { echo "临时 PostgreSQL 未就绪" >&2; exit 1; }

echo "==> 导入备份（只写临时容器）"
gunzip -c "$BACKUP_FILE" | docker exec -i "$container" \
  psql -v ON_ERROR_STOP=1 -U "$RESTORE_DB_USER" -d restore_rehearsal >/dev/null

for table in users generation_records generation_artifacts; do
  exists="$(docker exec "$container" psql -At -U "$RESTORE_DB_USER" -d restore_rehearsal \
    -c "select to_regclass('public.$table') is not null")"
  [[ "$exists" == "t" ]] || { echo "恢复校验失败：缺少表 $table" >&2; exit 1; }
done

echo "==> 恢复演练通过：gzip 完整、SQL 可导入、核心表存在"

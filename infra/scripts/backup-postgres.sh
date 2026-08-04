#!/usr/bin/env sh
# 每日 Postgres 备份：pg_dump | gzip → 原子写入 → 保留期轮转（可选 OSS 上传）。
#
# 运行环境：compose 的 backup 容器（postgres:16-alpine，含 pg_dump）每 24h 调用一次；
# 也可在服务器上手动触发 `pnpm run db:backup:production`。
set -eu

DATABASE_URL="${DATABASE_URL:?缺少 DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_OSS_UPLOAD="${BACKUP_OSS_UPLOAD:-false}"

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/bailian-studio-$TS.sql.gz"
TMP="$OUT.tmp"

if ! pg_dump "$DATABASE_URL" | gzip -9 > "$TMP"; then
  echo "[backup] pg_dump 失败，已保留临时文件用于排查: $TMP" >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"
echo "[backup] 完成: $OUT"

# 保留期轮转：删除早于保留天数的备份文件。
find "$BACKUP_DIR" -name 'bailian-studio-*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete

# 可选 OSS 上传：仅当显式开启且服务器存在 ossutil/aliyun CLI 时执行。
# OSS ACCESS_KEY 等凭据不进脚本，由目标环境配置（如 ossutil config 或环境变量）。
if [ "$BACKUP_OSS_UPLOAD" = "true" ]; then
  if command -v ossutil >/dev/null 2>&1; then
    ossutil cp "$OUT" "oss://${OSS_BUCKET:-bailian-studio-backups}/" >/dev/null 2>&1 \
      && echo "[backup] 已上传 OSS" \
      || echo "[backup] OSS 上传失败（检查 ossutil 配置）" >&2
  elif command -v aliyun >/dev/null 2>&1; then
    aliyun oss cp "$OUT" "oss://${OSS_BUCKET:-bailian-studio-backups}/" >/dev/null 2>&1 \
      && echo "[backup] 已上传 OSS" \
      || echo "[backup] OSS 上传失败（检查 aliyun CLI 配置）" >&2
  else
    echo "[backup] OSS 上传跳过（未找到 ossutil/aliyun CLI）"
  fi
fi

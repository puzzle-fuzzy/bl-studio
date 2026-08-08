#!/usr/bin/env sh
# 每日 Postgres 备份：pg_dump | gzip → 原子写入 → 保留期轮转 → OSS 上传。
#
# 运行环境：专用 backup 镜像每 24h 调用一次；也可在服务器上手动触发
# `pnpm run db:backup:production`。OSS 上传使用镜像内的 ali-oss SDK，不依赖宿主机 CLI。
set -eu
# pg_dump 在管道前端运行；没有 pipefail 时，gzip 成功会掩盖 pg_dump 失败。
set -o pipefail

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

# P2-35：gzip 完整性校验。管道成功不代表产物可解压（磁盘满/内存不足/中断都可能
# 截断文件）；校验通过才原子 mv 为正式备份，损坏产物直接删除并标红。
if ! gzip -t "$TMP"; then
  echo "[backup] gzip 完整性校验失败，删除损坏临时文件: $TMP" >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"
echo "[backup] 完成: $OUT"

# 保留期轮转：删除早于保留天数的备份文件。
find "$BACKUP_DIR" -name 'bailian-studio-*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete

# P0-07：上传失败必须返回非零退出码（标红），不能只 echo 吞掉 —— compose 入口循环
# 据此记录失败并在 5 分钟后重试，运维日志能立即看到。
if [ "$BACKUP_OSS_UPLOAD" = "true" ]; then
  /opt/bailian-studio/node_modules/.bin/tsx /opt/bailian-studio/upload-backup-to-oss.ts "$OUT"
fi

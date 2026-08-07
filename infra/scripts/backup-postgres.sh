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

# 可选 OSS 上传：仅当显式开启且服务器存在 ossutil/aliyun CLI 时执行。
# OSS ACCESS_KEY 等凭据不进脚本，由目标环境配置（如 ossutil config 或环境变量）。
# P0-07：上传失败必须返回非零退出码（标红），不能只 echo 吞掉 ——
# compose 入口循环据此记录失败并在 5 分钟后重试，运维日志能立即看到。
oss_upload() {
  local src="$1" dst="oss://${OSS_BUCKET:-bailian-studio-backups}/"
  if command -v ossutil >/dev/null 2>&1; then
    if ossutil cp "$src" "$dst" >/dev/null 2>&1; then
      echo "[backup] 已上传 OSS"
      return 0
    fi
  elif command -v aliyun >/dev/null 2>&1; then
    if aliyun oss cp "$src" "$dst" >/dev/null 2>&1; then
      echo "[backup] 已上传 OSS"
      return 0
    fi
  else
    echo "[backup] OSS 上传跳过：BACKUP_OSS_UPLOAD=true 但未找到 ossutil/aliyun CLI（检查服务器安装）" >&2
    return 1
  fi
  echo "[backup] OSS 上传失败（检查 CLI 配置 / ACCESS_KEY 权限 / bucket 名）" >&2
  return 1
}

exit_code=0
if [ "$BACKUP_OSS_UPLOAD" = "true" ]; then
  if ! oss_upload "$OUT"; then
    exit_code=1
  fi
fi
exit "$exit_code"

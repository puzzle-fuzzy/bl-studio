#!/usr/bin/env bash
# 下载「静态编译」ffmpeg 到宿主机指定目录。
#
# 为什么需要静态版：worker 跑在 Debian 容器里，而宿主机（OpenCloudOS/RHEL 系）
# 包管理器装的 ffmpeg 是动态 rpm 构建（库在 /usr/lib64），无法安全 bind-mount 进
# Debian 容器。静态版自包含、无共享库依赖，可挂载到容器任意路径使用。
# 下载完成后，worker 容器通过 compose 的 bind mount 使用它，runtime 镜像可不再
# 打包 apt ffmpeg（镜像瘦身 ~150MB，部署传输更小）。
#
# 用法:
#   infra/scripts/fetch-static-ffmpeg.sh [目标目录，默认 /opt/bailian-studio/ffmpeg]
# 环境变量:
#   FFMPEG_STATIC_URL  覆盖下载地址（默认 johnvansickle amd64 static release）
#
# 幂等：已就绪（./ffmpeg 可运行）则直接退出；重复下载用 --continue-at 续传。
set -euo pipefail

DEST="${1:-/opt/bailian-studio/ffmpeg}"
URL="${FFMPEG_STATIC_URL:-https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz}"

mkdir -p "$DEST"
cd "$DEST"

if [[ -x ./ffmpeg ]] && ./ffmpeg -version >/dev/null 2>&1; then
  echo "static ffmpeg already ready at $DEST/ffmpeg ($(./ffmpeg -version 2>&1 | head -1))"
  exit 0
fi

echo "downloading $URL -> $DEST/ffmpeg-static.tar.xz"
# 源站在国内较慢：允许续传 + 多次重试；失败不中断（脚本可重跑续传）。
curl -fsSL --retry 5 --retry-delay 10 --continue-at - -o ffmpeg-static.tar.xz "$URL"

tar xJf ffmpeg-static.tar.xz
BIN="$(find . -maxdepth 1 -type d -name 'ffmpeg-*-static' | head -1)"
if [[ -z "$BIN" ]]; then
  echo "failed to locate static ffmpeg directory after extraction" >&2
  exit 1
fi
cp "$BIN/ffmpeg" ./ffmpeg
if [[ -f "$BIN/ffprobe" ]]; then cp "$BIN/ffprobe" ./ffprobe; fi
chmod +x ./ffmpeg ./ffprobe 2>/dev/null || true

./ffmpeg -version > ffmpeg-version.txt 2>&1
echo "static ffmpeg ready at $DEST/ffmpeg: $(head -1 ffmpeg-version.txt)"

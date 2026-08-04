#!/usr/bin/env bash
# 宿主机 nginx 边缘接入（幂等）：为 create/logs.yxswy.com 签发证书并写入 conf.d。
# 在服务器上由 deploy-prod.sh 调用，也可手动重跑。
#
# 流程：写 HTTP-only conf.d（well-known + 重定向）→ reload →
# certbot webroot 签发证书（已存在则跳过）→ 写完整 conf.d（HTTP+HTTPS）→ reload。
# 日志入口 basic_auth 密码 = GRAFANA_ADMIN_PASSWORD（apr1 哈希，nginx 稳定支持）。
set -euo pipefail

# 参数：infra 目录（含 env/ nginx/），默认 /opt/bailian-studio/infra。
INFRA_DIR="${1:-/opt/bailian-studio/infra}"
ENV_INFRA="$INFRA_DIR/env/.env.prod-infra"
NGINX_CONFD="/etc/nginx/conf.d"
ACME_ROOT="/var/www/bailian-acme"
HTPASSWD_FILE="/etc/nginx/htpasswd.bailian-logs"
DOMAINS=("create.yxswy.com" "logs.yxswy.com")

[[ -f "$ENV_INFRA" ]] || { echo "缺少 $ENV_INFRA" >&2; exit 1; }

env_val() { awk -F= -v k="$1" '$1==k { sub(/^[^=]*=/,""); print }' "$ENV_INFRA" | tail -n 1; }

LE_EMAIL="$(env_val LE_EMAIL)"
GRAFANA_USER="$(env_val GRAFANA_ADMIN_USER)"
GRAFANA_PASSWORD="$(env_val GRAFANA_ADMIN_PASSWORD)"
GRAFANA_USER="${GRAFANA_USER:-viewer}"
[[ -n "$LE_EMAIL" ]] || { echo "缺少 LE_EMAIL（.env.prod-infra）" >&2; exit 1; }
[[ -n "$GRAFANA_PASSWORD" ]] || { echo "缺少 GRAFANA_ADMIN_PASSWORD" >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "服务器缺少 openssl" >&2; exit 1; }

# 1) ACME webroot + basic_auth 密码文件（apr1，nginx 的 crypt() 稳定支持）。
mkdir -p "$ACME_ROOT"
HASH="$(openssl passwd -apr1 "$GRAFANA_PASSWORD")"
printf '%s:%s\n' "$GRAFANA_USER" "$HASH" > "$HTPASSWD_FILE"
chmod 640 "$HTPASSWD_FILE"
chown root:nginx "$HTPASSWD_FILE" 2>/dev/null || true
echo "==> acme root + htpasswd 就绪"

# 2) 先写 HTTP-only conf.d（供 certbot webroot 校验），reload。
for d in "${DOMAINS[@]}"; do
  cat > "$NGINX_CONFD/$d.conf" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $d;

    location ^~ /.well-known/acme-challenge/ {
        root $ACME_ROOT;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF
done
nginx -t && systemctl reload nginx
echo "==> HTTP-only conf.d 已生效"

# 3) 缺证书则签发（幂等，已存在直接跳过）。
NEED_CERT=0
for d in "${DOMAINS[@]}"; do
  [[ -f "/etc/letsencrypt/live/$d/fullchain.pem" ]] || NEED_CERT=1
done
if [[ "$NEED_CERT" == "1" ]]; then
  echo "==> 签发证书（certbot webroot）..."
  certbot certonly --webroot -w "$ACME_ROOT" \
    -d create.yxswy.com -d logs.yxswy.com \
    --non-interactive --agree-tos --email "$LE_EMAIL" \
    --keep-until-expiring
else
  echo "==> 证书已存在，跳过签发"
fi

# 4) 写入完整 conf.d（HTTP+HTTPS，模板来自仓库 infra/nginx/）。
for d in "${DOMAINS[@]}"; do
  [[ -f "$INFRA_DIR/nginx/$d.conf" ]] || { echo "缺少模板 $INFRA_DIR/nginx/$d.conf" >&2; exit 1; }
  cp "$INFRA_DIR/nginx/$d.conf" "$NGINX_CONFD/$d.conf"
done
nginx -t && systemctl reload nginx
echo "==> 完整 conf.d 已生效：create/logs.yxswy.com"

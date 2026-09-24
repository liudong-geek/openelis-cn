#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${OPENELIS_CN_ENV_FILE:-$ROOT_DIR/.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "错误：未找到本地环境文件 $ENV_FILE；请先由 .env.example 创建 .env。" >&2
  exit 2
fi
COMPOSE=(
  docker compose --env-file "$ENV_FILE" -p openelis-cn
  -f "$ROOT_DIR/docker-compose.yml"
  -f "$ROOT_DIR/docker-compose.cn.yml"
  -f "$ROOT_DIR/docker-compose.local.yml"
)

print_status() {
  docker ps --filter "name=openelis-cn-" \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

require_production_volume() {
  if ! docker volume inspect openelis-cn_db-data >/dev/null 2>&1; then
    echo "错误：未找到正式数据卷 openelis-cn_db-data；为防止误启用空数据库，已停止启动。" >&2
    exit 2
  fi
}

case "${1:-}" in
  start)
    require_production_volume
    "${COMPOSE[@]}" up -d \
      db.openelis.org oe.openelis.org frontend.openelis.org proxy
    print_status
    ;;
  start-integration)
    require_production_volume
    "${COMPOSE[@]}" --profile integration up -d \
      db.openelis.org oe.openelis.org frontend.openelis.org proxy fhir.openelis.org
    print_status
    ;;
  stop)
    "${COMPOSE[@]}" --profile integration stop \
      fhir.openelis.org proxy frontend.openelis.org oe.openelis.org db.openelis.org
    print_status
    ;;
  status)
    print_status
    ;;
  *)
    echo "用法: $0 {start|start-integration|stop|status}"
    echo "  start              启动日常 LIS 核心服务（默认）"
    echo "  start-integration  额外启动 FHIR 集成服务"
    echo "  stop               停止本项目全部常驻服务"
    echo "  status             查看本项目容器状态"
    exit 1
    ;;
esac

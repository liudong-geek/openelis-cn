#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(
  docker compose
  -f "$ROOT_DIR/docker-compose.yml"
  -f "$ROOT_DIR/docker-compose.cn.yml"
  -f "$ROOT_DIR/docker-compose.local.yml"
)

print_status() {
  docker ps --filter "name=openelis-cn-" \
    --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
}

case "${1:-}" in
  start)
    "${COMPOSE[@]}" up -d \
      db.openelis.org oe.openelis.org frontend.openelis.org proxy
    print_status
    ;;
  start-integration)
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

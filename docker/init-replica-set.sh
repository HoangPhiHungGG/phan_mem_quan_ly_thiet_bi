#!/usr/bin/env bash
# Khởi tạo replica set một node cho MongoDB local (dev only).
# An toàn khi chạy lặp lại: chỉ init nếu chưa có replica set.
# KHÔNG xóa dữ liệu, KHÔNG reset database.
set -euo pipefail

CONTAINER="pmqltb-mongodb"
REPLICA_SET_NAME="${MONGO_REPLICA_SET_NAME:-rs0}"

echo "==> Chờ MongoDB sẵn sàng..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" mongosh --quiet --eval "db.adminCommand('ping').ok" >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "ERROR: MongoDB không sẵn sàng sau 30 lần thử." >&2
    exit 1
  fi
  sleep 2
done

echo "==> Kiểm tra trạng thái replica set..."
STATUS=$(docker exec "$CONTAINER" mongosh --quiet --eval "try { rs.status().ok } catch(e) { 0 }" 2>/dev/null || echo "0")

if [ "$STATUS" = "1" ]; then
  echo "==> Replica set '$REPLICA_SET_NAME' đã hoạt động. Không làm gì thêm."
  docker exec "$CONTAINER" mongosh --quiet --eval "rs.status().set" 2>/dev/null || true
  exit 0
fi

echo "==> Khởi tạo replica set '$REPLICA_SET_NAME'..."
docker exec "$CONTAINER" mongosh --quiet --eval "
  rs.initiate({
    _id: '$REPLICA_SET_NAME',
    members: [{ _id: 0, host: '127.0.0.1:27017' }]
  })
"

echo "==> Chờ replica set primary..."
for i in $(seq 1 30); do
  IS_MASTER=$(docker exec "$CONTAINER" mongosh --quiet --eval "db.isMaster().ismaster" 2>/dev/null || echo "false")
  if [ "$IS_MASTER" = "true" ]; then
    echo "==> Replica set sẵn sàng (primary)."
    exit 0
  fi
  sleep 2
done

echo "ERROR: Replica set chưa sẵn sàng sau 30 lần thử." >&2
exit 1
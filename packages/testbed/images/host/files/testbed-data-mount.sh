#!/bin/sh
# Stackra file contract:
# Purpose: testbed-data-mount: find the box's data volume (the one disk that is not the root disk), format it XFS with
#          reflinks and label `testbed-data` when it has no filesystem yet, and mount it at /data. An AMI-built volume
#          already carries the filesystem and its preloaded images, so a box from the AMI only mounts.
# Boundary: runs as root from testbed-data.service before Docker starts; touches only the one non-root disk.
# Runtime: box (systemd, Ubuntu 24.04)
# Governing contract: ADR 0484 (decision 3).
set -eu

MOUNT=/data
mkdir -p "$MOUNT"
if mountpoint -q "$MOUNT"; then exit 0; fi

root_disk=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" | head -n 1)
device=
for _ in $(seq 1 30); do
  device=$(lsblk -dpno NAME,TYPE | awk -v root="/dev/$root_disk" '$2 == "disk" && $1 != root { print $1; exit }')
  [ -z "$device" ] || break
  sleep 2
done
[ -n "$device" ] || {
  echo "testbed-data-mount: no data volume found" >&2
  exit 1
}

if ! blkid "$device" >/dev/null 2>&1; then
  mkfs.xfs -m reflink=1 -L testbed-data "$device"
fi
mount -o noatime "$device" "$MOUNT"
mkdir -p "$MOUNT/docker" "$MOUNT/jobs" "$MOUNT/seed" "$MOUNT/pnpm-store" "$MOUNT/turbo-cache"
chown ubuntu:ubuntu "$MOUNT/jobs" "$MOUNT/seed" "$MOUNT/pnpm-store" "$MOUNT/turbo-cache"

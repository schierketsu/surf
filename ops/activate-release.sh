#!/usr/bin/env bash
set -euo pipefail

archive="${1:?Archive path required}"
release="${2:?Release name required}"
web_root=/var/www/doska
current="$web_root/current"

if [[ ! "$release" =~ ^[0-9]{8}T[0-9]{6}$ ]]; then
  echo 'Invalid release name.' >&2
  exit 1
fi
if [[ ! -f "$archive" ]]; then
  echo "Archive not found: $archive" >&2
  exit 1
fi
if [[ ! -L "$current" ]]; then
  echo "Expected existing site symlink: $current" >&2
  echo 'Check the nginx document root before changing the deployment layout.' >&2
  exit 1
fi

releases="$web_root/releases"
target="$releases/$release"
link="$web_root/.current-$release"
previous=$(readlink "$current")

if [[ -e "$target" ]]; then
  echo "Release already exists: $target" >&2
  exit 1
fi

mkdir -p "$target"
trap 'rm -f "$archive" /tmp/activate-release.sh "$link"' EXIT
tar -xzf "$archive" -C "$target"
test -f "$target/index.html"
chmod -R a+rX "$target"

nginx -t
ln -s "$target" "$link"
mv -Tf "$link" "$current"
if ! systemctl reload nginx; then
  ln -s "$previous" "$link"
  mv -Tf "$link" "$current"
  echo 'Nginx reload failed; restored the previous release.' >&2
  exit 1
fi

echo "Activated $target"

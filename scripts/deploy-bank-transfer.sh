#!/usr/bin/env bash
# Build against the server's existing HEAD before touching the running release.
set -Eeuo pipefail
app=/opt/homay/app
release_commit="${1:?Pass the full bank-transfer release commit SHA}"
[[ "$release_commit" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid release SHA"; exit 1; }
[[ "$(id -u)" == 0 ]] || { echo "Run as root on the Homay server."; exit 1; }
cd "$app"
git cat-file -e "$release_commit^{commit}"
if git merge-base --is-ancestor "$release_commit" HEAD; then
  echo "This release is already installed in Git. No changes made."
  exit 0
fi
mapfile -t changed_paths < <(git diff-tree --no-commit-id --name-only -r "$release_commit")
git diff --quiet HEAD -- "${changed_paths[@]}" || {
  echo "STOP: local edits overlap payment files. No local edits were changed."
  git diff --name-only HEAD -- "${changed_paths[@]}"
  exit 1
}
deployment_dir="$(mktemp -d /opt/homay/bank-release.XXXXXXXX)"
stage="$deployment_dir/stage"
rollback_dir="$deployment_dir/previous-build"
mkdir -p "$rollback_dir"
stopped=0
applied=0
old_node=0
old_build=0
swapped=0
cleanup() {
  result=$?
  trap - EXIT
  if (( result != 0 && stopped == 1 )); then
    if (( applied == 1 )); then
      git revert --no-edit HEAD || {
        echo "Rollback of source needs manual review. Services remain stopped."
        exit "$result"
      }
    else
      git cherry-pick --abort 2>/dev/null || true
    fi
    if (( swapped == 1 )); then
      mv "$app/node_modules" "$deployment_dir/failed-node_modules" 2>/dev/null || true
      mv "$app/.next" "$deployment_dir/failed-next" 2>/dev/null || true
    fi
    if (( old_node == 1 )); then mv "$rollback_dir/node_modules" "$app/node_modules"; fi
    if (( old_build == 1 )); then mv "$rollback_dir/.next" "$app/.next"; fi
    systemctl start homay.service homay-worker.service
    echo "Deployment failed; the previous source and build were restored."
  fi
  git worktree remove --force "$stage" 2>/dev/null || true
  if (( result != 0 )); then echo "Deployment records: $deployment_dir"; fi
  exit "$result"
}
trap cleanup EXIT
git worktree add --detach "$stage" HEAD
git -C "$stage" cherry-pick "$release_commit"
for config in .env .env.local .env.production .env.production.local; do
  if [[ -f "$app/$config" ]]; then
    cp "$app/$config" "$stage/$config"
    chmod 600 "$stage/$config"
  fi
done
chown -R homay:homay "$deployment_dir"
chmod 700 "$deployment_dir"
runuser -u homay -- bash -c 'cd "$1" && npm ci --include=dev --no-audit --no-fund && npm run build' bash "$stage"
runuser -u homay -- bash -c 'cd "$1" && npm run platform:backup -- "$2"' bash "$app" "$deployment_dir/database-backup"
systemctl stop homay.service homay-worker.service
stopped=1
git cherry-pick "$release_commit"
applied=1
if [[ -d "$app/node_modules" ]]; then mv "$app/node_modules" "$rollback_dir/node_modules"; old_node=1; fi
if [[ -d "$app/.next" ]]; then mv "$app/.next" "$rollback_dir/.next"; old_build=1; fi
swapped=1
mv "$stage/node_modules" "$app/node_modules"
mv "$stage/.next" "$app/.next"
runuser -u homay -- bash -c 'cd "$1" && npm run platform:setup' bash "$app"
systemctl start homay.service homay-worker.service
systemctl is-active --quiet homay.service
systemctl is-active --quiet homay-worker.service
stopped=0
echo "Bank-transfer receipt release installed. Backups: $deployment_dir"
echo "Admin: /admin -> رسیدهای واریز"

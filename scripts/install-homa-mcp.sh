#!/usr/bin/env bash
# Install the private bridge only. This does not deploy/restart the Homay app.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run in the root VPS terminal.' >&2; exit 1; }
release=${1:?Pass the reviewed bridge commit SHA}
[[ $release =~ ^[a-f0-9]{40}$ ]] || exit 1
[[ -d /opt/homay/app/.git || -f /opt/homay/app/.git ]] || { echo 'Homay app not found.'; exit 1; }
for tool in /usr/bin/node /usr/bin/npm /usr/bin/python3 /usr/bin/curl /usr/bin/git /usr/bin/sudo /usr/sbin/visudo /usr/sbin/runuser /usr/bin/systemctl /usr/bin/systemd-run /usr/bin/flock; do
  [[ -x $tool ]] || { echo "Required program missing: $tool"; exit 1; }
done
/usr/bin/node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'
id homay >/dev/null
[[ -d /run/systemd/system ]] || { echo 'This installer requires a systemd Ubuntu/Debian VPS.'; exit 1; }
exec 9>/var/lock/homa-mcp-install.lock
flock -n 9 || { echo 'Another bridge installation is running.'; exit 1; }
target=/usr/local/lib/homa-mcp
tmpdir=$(mktemp -d /var/tmp/homa-mcp-install.XXXXXXXX)
trap 'rm -rf "$tmpdir"' EXIT
if [[ -d $target ]]; then
  [[ -f $target/source-release && $(cat "$target/source-release") == "$release" ]] || {
    echo 'A different bridge version is installed; review its update before replacing it.'; exit 1;
  }
  echo 'Same bridge version already installed; completing installation checks.'
else
  # Credentials are prompted locally before downloads/installation. Never in chat.
  mkdir "$tmpdir/source"
  fetch() {
    curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 10 --max-time 90 \
      "https://raw.githubusercontent.com/Rezamoradifar/Homasadati/$release/$1" -o "$2"
  }
  for name in package.json package-lock.json server.mjs smoke.mjs helper.py configure.py run-tunnel.py download-tunnel.py homa-mcp.service; do
    fetch "tools/homa-server/$name" "$tmpdir/source/$name"
  done
  fetch scripts/deploy-zibal.sh "$tmpdir/source/deploy-zibal.sh"
  bash -n "$tmpdir/source/deploy-zibal.sh"
  /usr/bin/node --check "$tmpdir/source/server.mjs"
  /usr/bin/python3 -I "$tmpdir/source/configure.py" </dev/tty
  if ! id homa-mcp >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/homa-mcp --shell /usr/sbin/nologin homa-mcp
  fi
  # Never grant membership in the app account or administrator groups.
  [[ $(id -Gn homa-mcp) == homa-mcp ]] || { echo 'homa-mcp must have only its dedicated group.'; exit 1; }
  install -d -m 700 -o root -g root /var/lib/homa-mcp-jobs
  install -d -m 700 -o homa-mcp -g homa-mcp /var/lib/homa-mcp
  chmod 755 "$tmpdir"
  chown -R homa-mcp:homa-mcp "$tmpdir/source"
  chmod 755 "$tmpdir/source"
  # Dependency install runs unprivileged, with lifecycle scripts disabled.
  runuser -u homa-mcp -- env -i PATH=/usr/bin:/bin HOME=/var/lib/homa-mcp \
    /usr/bin/npm ci --prefix "$tmpdir/source" --omit=dev --ignore-scripts --no-audit --no-fund
  chown -R root:root "$tmpdir/source"
  /usr/bin/python3 -I "$tmpdir/source/download-tunnel.py" "$tmpdir/source/tunnel-client"
  "$tmpdir/source/tunnel-client" --version
  printf '%s\n' "$release" > "$tmpdir/source/source-release"
  # Remove write permissions for the runtime user before exposing the sudo helper.
  chmod -R u=rwX,go=rX "$tmpdir/source"
  install -d -m 755 /usr/local/lib
  mv "$tmpdir/source" "$target"
fi
printf '%s\n' 'homa-mcp ALL=(root) NOPASSWD: /usr/bin/python3 -I /usr/local/lib/homa-mcp/helper.py' > "$tmpdir/sudoers"
visudo -cf "$tmpdir/sudoers"
install -m 440 -o root -g root "$tmpdir/sudoers" /etc/sudoers.d/homa-mcp
install -m 644 "$target/homa-mcp.service" /etc/systemd/system/homa-mcp.service
systemctl daemon-reload
systemctl enable --now homa-mcp.service
ready=0
for attempt in {1..20}; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:18793/readyz >/dev/null; then ready=1; break; fi
  sleep 2
done
systemctl is-active --quiet homa-mcp.service
if ((ready == 0)); then
  echo 'Bridge installed, but tunnel readiness is not confirmed. Check runtime-key permissions and tunnel/workspace association.'
  echo 'Local diagnostics: journalctl -u homa-mcp.service -n 40 --no-pager'
  exit 1
fi
echo 'HOMA_TUNNEL_READY'
echo 'HOMA_MCP_LOCAL_CHECK_OK (service ExecStartPre passed)'
echo 'In ChatGPT > Plugins > New Plugin: Connection=Tunnel, select this tunnel; Authentication=No authentication for this private stdio MCP server.'
/usr/bin/python3 -I -c 'import json; print("Tunnel ID:", json.load(open("/etc/homa-mcp/config.json"))["tunnel_id"])'
echo 'After connecting, invoke Homa Server and request homa_status first. Do not post the runtime key or raw secret-bearing logs in chat.'

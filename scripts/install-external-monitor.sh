#!/usr/bin/env bash
# Run on an independent Linux host, not on the Homay application server.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root on the independent monitoring host.' >&2; exit 1; }
release=${1:?Pass the verified release commit SHA}
[[ $release =~ ^[0-9a-f]{40}$ ]] || exit 1
command -v node >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0])<18)process.exit(1)'
command -v curl >/dev/null
command -v systemctl >/dev/null
tmpdir=$(mktemp -d /tmp/homay-monitor.XXXXXX)
trap 'rm -rf "$tmpdir"' EXIT
curl -fsSL --connect-timeout 10 --max-time 30 "https://raw.githubusercontent.com/Rezamoradifar/Homasadati/$release/scripts/external-monitor.mjs" -o "$tmpdir/monitor.mjs"
node --check "$tmpdir/monitor.mjs"
install -d -m 755 /usr/local/lib/homay-external-monitor
install -m 644 "$tmpdir/monitor.mjs" /usr/local/lib/homay-external-monitor/monitor.mjs
if [[ ! -e /etc/homay-external-monitor.env ]]; then
  install -m 600 /dev/null /etc/homay-external-monitor.env
  cat > /etc/homay-external-monitor.env <<'ENV'
MONITOR_ORIGIN=https://homanets.com
MONITOR_STATE_PATH=/var/lib/homay-external-monitor/state.json
# Add your existing HTTPS owner alert endpoint to enable notifications:
# ALERT_WEBHOOK_URL=https://...
ENV
fi
node_bin=$(command -v node)
[[ $node_bin =~ ^/[A-Za-z0-9_./-]+$ ]] || exit 1
cat > /etc/systemd/system/homay-external-monitor.service <<UNIT
[Unit]
Description=Homay independent public availability probe
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
DynamicUser=yes
StateDirectory=homay-external-monitor
EnvironmentFile=/etc/homay-external-monitor.env
ExecStart=$node_bin /usr/local/lib/homay-external-monitor/monitor.mjs --notify
TimeoutStartSec=35
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
UNIT
cat > /etc/systemd/system/homay-external-monitor.timer <<'UNIT'
[Unit]
Description=Check Homay public availability every minute
[Timer]
OnBootSec=30s
OnUnitInactiveSec=60s
AccuracySec=5s
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now homay-external-monitor.timer
systemctl start homay-external-monitor.service || true
systemctl is-active homay-external-monitor.timer
journalctl -u homay-external-monitor.service -n 3 --no-pager
echo 'Independent monitoring installed. Alerts require ALERT_WEBHOOK_URL in /etc/homay-external-monitor.env.'

// pm2 config for the nhansu app on production VPS.
//
// Invariants:
//   - `script` points at the next binary directly (NOT `npm`) so pm2 watches
//     the Node process itself — that's what makes `max_memory_restart` actually
//     trigger. The previous `script: 'npm'` setup meant pm2 only watched npm
//     and let the Node child OOM silently at ~1GB.
//   - `node_args` raises the V8 old-space cap to 1400MB. VPS has 1.9GB RAM +
//     2GB swap; sheet-sync peak is the constraint we're budgeting against.
//   - `max_memory_restart` is above the heap cap on purpose — it's a safety
//     net in case of a RSS leak outside the managed heap, not the primary
//     limit.
//
// The file lives at both /var/www/nhansu/app/ecosystem.config.cjs (this repo,
// source of truth) and /var/www/nhansu/ecosystem.config.cjs (where pm2 loads
// from). deploy.sh is responsible for keeping them in sync.
module.exports = {
  apps: [{
    name: 'nhansu',
    script: './node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/var/www/nhansu/app',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    node_args: ['--max-old-space-size=1400'],
    max_memory_restart: '1600M',
    env: {
      NODE_ENV: 'production',
      PORT: '3010',
    },
    out_file: '/var/www/nhansu/logs/app.log',
    error_file: '/var/www/nhansu/logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_restarts: 10,
    restart_delay: 5000,
  }]
}

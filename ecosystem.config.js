/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: 'second-brain-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: __dirname,
      node_args: '-r dotenv/config',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        DOTENV_CONFIG_PATH: '.env.local',
        // /tmp is a ~1GB RAM-backed tmpfs on the server — keep temp files on disk
        TMPDIR: '/home/ec2-user/tmp',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
    },
    {
      name: 'second-brain-worker',
      script: 'node_modules/.bin/tsx',
      args: '--env-file=.env.local workers/ingestion-worker.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        TMPDIR: '/home/ec2-user/tmp',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,
    },
    {
      name: 'second-brain-orphan-cleanup',
      script: 'npm',
      args: 'run cleanup-orphans -- --fix',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      cron_restart: '0 3 * * *',
      autorestart: false,
      watch: false,
      error_file: './logs/cleanup-error.log',
      out_file: './logs/cleanup-out.log',
    },
  ],
}

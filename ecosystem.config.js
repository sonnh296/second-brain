/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: 'second-brain-web',
      script: 'npm',
      args: 'start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
    },
    {
      name: 'second-brain-worker',
      script: 'npm',
      args: 'run worker',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
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

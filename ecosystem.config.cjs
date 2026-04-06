module.exports = {
  apps: [
    {
      name: "mipixi-pro",
      script: "src/server.js",
      cwd: "/root/mipixi-pro-repo/backend",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      min_uptime: "10s",
      kill_timeout: 10000,
      time: true,
      merge_logs: true,
      out_file: "/var/log/mipixi-pro/app-out.log",
      error_file: "/var/log/mipixi-pro/app-error.log",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },
  ],
};

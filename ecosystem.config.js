module.exports = {
  apps: [
    {
      name: "dedos-bienvenidas",
      script: "index.js",
      cwd: __dirname,
      time: true,
      max_restarts: 10,
      exp_backoff_restart_delay: 5000,
      env: {
        NODE_ENV: "production"
      },
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};


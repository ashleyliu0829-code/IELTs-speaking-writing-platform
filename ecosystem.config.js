// pm2 process definition.
//
// The port lives here rather than in the shell that happens to start pm2.
// It was previously passed on the command line only, so nothing recorded it:
// rebuilding the process later defaulted to 3000, which nginx already holds,
// and the app crash-looped on EADDRINUSE.
//
// nginx proxies ielts-speaking-ashley.com to 127.0.0.1:3001.
//
//   pm2 start ecosystem.config.js
//   pm2 save
//
// PORT in .env.local would not work: `next start` reads the port before Next
// loads the env files.

module.exports = {
  apps: [
    {
      name: "ielts-speaking",
      script: "npm",
      args: "run start",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3001
      },
      max_restarts: 10,
      // A crash loop that outruns this window is a real failure, not a blip
      // worth restarting into forever.
      min_uptime: "20s"
    }
  ]
};

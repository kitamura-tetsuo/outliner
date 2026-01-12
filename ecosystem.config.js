const { config } = require('@dotenvx/dotenvx');

config({ path: './.env.test' });

module.exports = {
  apps: [
    {
      name: 'firebase-emulators',
      script: 'firebase',
      args: 'emulators:start --only auth,firestore,functions,hosting,storage --config firebase.emulator.json --project outliner-d57b0',
      cwd: '.',
      env: {
        NODE_ENV: 'test',
        USE_FIREBASE_EMULATOR: 'true',
        FIREBASE_AUTH_EMULATOR_HOST: 'localhost:59099',
        FIRESTORE_EMULATOR_HOST: 'localhost:58080',
        FIREBASE_EMULATOR_HOST: 'localhost:57070',
      },
      log_file: './logs/firebase-emulators.log',
      out_file: './logs/firebase-emulators.log',
      error_file: './logs/firebase-emulators.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'yjs-server',
      script: 'npm',
      args: 'start',
      cwd: './server',
      env: {
        NODE_ENV: 'test',
        PORT: 7093,
        ...process.env,
      },
      log_file: './logs/yjs-server.log',
      out_file: '../logs/yjs-server.log',
      error_file: '../logs/yjs-server.log',
      log_date_format: 'YYYY-MM-DD HH:mm:s',
    },
    {
      name: 'vite-server',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0 --port 7090',
      cwd: './client',
      env: {
        NODE_ENV: 'test',
        ...process.env,
      },
      log_file: './logs/vite-server.log',
      out_file: '../logs/vite-server.log',
      error_file: '../logs/vite-server.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};

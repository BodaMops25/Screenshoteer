import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RESTART_EXIT_CODE = 75;
const ENTRY_FILE = fileURLToPath(new URL('./index.ts', import.meta.url));

function launch(): void {
  const child = spawn(process.execPath, [ENTRY_FILE], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });

  child.once('error', (error) => {
    console.error('Could not launch Screenshoteer:', error);
    process.exit(1);
  });

  child.once('exit', (code, signal) => {
    if (code === RESTART_EXIT_CODE) {
      console.log('Restarting Screenshoteer…');
      setTimeout(launch, 500);
      return;
    }

    if (signal) {
      console.log(`Screenshoteer stopped by ${signal}`);
      process.exit(0);
    }
    process.exit(code ?? 1);
  });
}

launch();

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DEV } from './dev.ts';

const reportedErrors = new Set<string>();

export function reportError(context: string, error: unknown): void {
  const details = formatError(context, error);

  if (DEV) {
    console.error(details);
    return;
  }

  try {
    const logFile = resolve(dirname(process.execPath), 'Screenshoteer-errors.log');
    appendFileSync(logFile, `${details}\n\n`, 'utf8');
  } catch {
    // Error reporting must never cause a second application failure.
  }

  const signature = `${context}:${error instanceof Error ? error.message : String(error)}`;
  if (reportedErrors.has(signature)) return;
  reportedErrors.add(signature);

  try {
    const dialog = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($env:SCREENSHOTEER_ERROR, "Screenshoteer error", "OK", "Error")',
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, SCREENSHOTEER_ERROR: details },
    });
    dialog.once('error', () => {});
    dialog.unref();
  } catch {
    // The file log is still available if Windows cannot open the dialog.
  }
}

function formatError(context: string, error: unknown): string {
  const description = error instanceof Error
    ? error.stack ?? `${error.name}: ${error.message}`
    : String(error);
  return [
    `[${new Date().toISOString()}] ${context}`,
    description,
    `Node ${process.versions.node} | ${process.platform} ${process.arch}`,
  ].join('\n');
}

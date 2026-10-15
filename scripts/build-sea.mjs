import { copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const executable = resolve(root, 'dist/Screenshoteer.exe');
const blob = resolve(root, 'dist/temp/sea-prep.blob');
const postject = resolve(root, 'node_modules/postject/dist/cli.js');

run(process.execPath, [
  '--experimental-sea-config',
  resolve(root, 'dist/temp/sea-config.json'),
]);
await copyFile(process.execPath, executable);
run(process.execPath, [
  postject,
  executable,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
]);

console.log('Created dist/Screenshoteer.exe');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import Module from 'node:module';
import { getRawAsset, isSea } from 'node:sea';

const NATIVE_ASSETS = [
  'node_modules/loopback-capture/package.json',
  'node_modules/loopback-capture/prebuilds/win32-x64/loopback_capture_addon.node',
  'node_modules/@coooookies/windows-smtc-monitor-win32-x64-msvc/package.json',
  'node_modules/@coooookies/windows-smtc-monitor-win32-x64-msvc/windows-smtc-monitor.win32-x64-msvc.node',
  'node_modules/@img/sharp-win32-x64/package.json',
  'node_modules/@img/sharp-win32-x64/index.cjs',
  'node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.5.node',
  'node_modules/@img/sharp-win32-x64/lib/libvips-42.dll',
  'node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.7.dll',
] as const;

export function prepareSeaRuntime(): void {
  if (!isSea()) return;

  const runtimeRoot = join(tmpdir(), `screenshoteer-sea-${process.versions.node}`);
  for (const asset of NATIVE_ASSETS) {
    const target = join(runtimeRoot, ...asset.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, new Uint8Array(getRawAsset(asset)));
  }

  const modulePath = join(runtimeRoot, 'node_modules');
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${modulePath}${delimiter}${process.env.NODE_PATH}`
    : modulePath;
  process.env.PATH = `${join(modulePath, '@img', 'sharp-win32-x64', 'lib')}`
    + `${delimiter}${process.env.PATH ?? ''}`;
  (Module as unknown as { _initPaths: () => void })._initPaths();
}

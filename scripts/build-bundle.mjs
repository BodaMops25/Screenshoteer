import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'settings'), { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/sea-entry.ts')],
  outfile: resolve(dist, 'screenshoteer.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  minify: false,
  sourcemap: false,
  external: [
    '*.node',
    '@coooookies/windows-smtc-monitor-win32-x64-msvc',
    '@img/sharp-win32-x64',
    '@img/sharp-win32-x64/*',
  ],
  banner: {
    js: [
      'require = require("node:module").createRequire(__filename);',
      'const __screenshoteerImportMetaUrl = require("node:url").pathToFileURL(__filename).href;',
    ].join('\n'),
  },
  define: {
    'import.meta.url': '__screenshoteerImportMetaUrl',
  },
  plugins: [{
    name: 'use-smtc-commonjs-entry',
    setup(context) {
      context.onResolve(
        { filter: /^@coooookies\/windows-smtc-monitor$/ },
        () => ({
          path: resolve(root, 'node_modules/@coooookies/windows-smtc-monitor/index.js'),
        }),
      );
    },
  }],
});

await copyFile(
  resolve(root, 'settings/index.html'),
  resolve(dist, 'settings/index.html'),
);

const seaConfig = {
  main: 'dist/screenshoteer.cjs',
  output: 'dist/sea-prep.blob',
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets: {
    'settings/index.html': 'settings/index.html',
    'node_modules/loopback-capture/package.json': 'node_modules/loopback-capture/package.json',
    'node_modules/loopback-capture/prebuilds/win32-x64/loopback_capture_addon.node': 'node_modules/loopback-capture/prebuilds/win32-x64/loopback_capture_addon.node',
    'node_modules/@coooookies/windows-smtc-monitor-win32-x64-msvc/package.json': 'node_modules/@coooookies/windows-smtc-monitor-win32-x64-msvc/package.json',
    'node_modules/@coooookies/windows-smtc-monitor-win32-x64-msvc/windows-smtc-monitor.win32-x64-msvc.node': 'node_modules/@coooookies/windows-smtc-monitor-win32-x64-msvc/windows-smtc-monitor.win32-x64-msvc.node',
    'node_modules/@img/sharp-win32-x64/package.json': 'node_modules/@img/sharp-win32-x64/package.json',
    'node_modules/@img/sharp-win32-x64/index.cjs': 'node_modules/@img/sharp-win32-x64/index.cjs',
    'node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.5.node': 'node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.5.node',
    'node_modules/@img/sharp-win32-x64/lib/libvips-42.dll': 'node_modules/@img/sharp-win32-x64/lib/libvips-42.dll',
    'node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.7.dll': 'node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.7.dll',
  },
};
await writeFile(
  resolve(dist, 'sea-config.json'),
  `${JSON.stringify(seaConfig, null, 2)}\n`,
  'utf8',
);

console.log('Bundled TypeScript to dist/screenshoteer.cjs');

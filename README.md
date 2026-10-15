# Screenshoteer

Screenshoteer sends real-time color data from a Windows display or currently playing
music to a WLED-controlled LED strip.

It supports two source modes:

- **Screen capture** samples a selected Windows monitor through FFmpeg.
- **Music** reads Windows system audio, detects the current media cover, and supports
  current-level, frequency-band, and spectrum output modes.

Settings are available in a local web interface at
<http://127.0.0.1:8090>. The Windows tray application opens this page and provides
quick mode controls.

## Requirements

- Windows x64
- Node.js 24 or newer
- FFmpeg available through `PATH`
- A WLED device reachable over the local network
- .NET 8 SDK, only when developing or building the tray application

The published tray executable is self-contained and does not require .NET to be
installed on the target computer.

## Install

```powershell
npm install
```

Copy or create `settings.json` in the project root, then adjust the WLED address and
other options through the settings page.

## Development

Start the TypeScript application directly:

```powershell
npm start
```

Start the development tray application:

```powershell
npm run tray
```

Run the separate color-correction utility:

```powershell
npm run color-correction
```

Development mode enables terminal statistics, diagnostic logging, browser simulation,
and the **Disable physical WLED output** setting. Production builds remove logging and
hide debug controls from the settings page.

## Production builds

Bundle the TypeScript application into one JavaScript file:

```powershell
npm run bundle
```

Build the Node.js single executable application:

```powershell
npm run build:exe
```

Build both the Node application and self-contained tray application:

```powershell
npm run build:tray
```

The final executables are:

```text
dist/Screenshoteer.exe
dist/ScreenshoteerTray.exe
```

SEA intermediate files are kept under `dist/temp`. `sea-prep.blob` is the Node.js SEA
payload that is injected into a copy of the Node executable.

Keep `Screenshoteer.exe` and `ScreenshoteerTray.exe` in the same directory. Starting
the tray executable automatically starts the main application without a console
window.

FFmpeg is not embedded in `Screenshoteer.exe`; it must remain available through
`PATH` on the target system.

## Settings and web assets

During development, settings are stored in the project-root `settings.json`. The
packaged application reads and writes `settings.json` beside `Screenshoteer.exe`.

Web assets are located in `html/`:

```text
html/settings.html
html/simulation.html
```

The production build embeds `settings.html`, so rebuild the executable after changing
it.

Some settings apply immediately, including application mode, audio mode, music timing,
and color-correction profiles. Connection, capture, LED calibration, and debug changes
require an application restart.

## Tray controls

- Left-click the tray icon to open settings.
- Right-click the tray icon to open its context menu.
- Change application or audio mode from the menu.
- Use **Shutdown** to stop the main application and close the tray process.

## License

MIT

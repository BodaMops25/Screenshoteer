# Screenshoteer tray app

Native Windows tray launcher and controller for the Screenshoteer Node application.

## Run during development

```powershell
dotnet run --project tray-app/Screenshoteer.Tray.csproj
```

## Publish

```powershell
dotnet publish tray-app/Screenshoteer.Tray.csproj -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true
```

The executable is written below `tray-app/bin/Release`. It searches parent folders for
`package.json` and `src/launcher.ts`. If the executable is moved elsewhere, set the
`SCREENSHOTEER_ROOT` environment variable to the Screenshoteer project directory.

The tray app starts Node without a console window and communicates only with the local
settings server at `http://127.0.0.1:8090`.

using System.Diagnostics;
using System.Net.Http.Json;

namespace Screenshoteer.Tray;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private const string SettingsUrl = "http://127.0.0.1:8090";
    private static readonly Uri SettingsApi = new($"{SettingsUrl}/api/settings");
    private static readonly Uri CommandApi = new($"{SettingsUrl}/api/command");

    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(3) };
    private readonly SemaphoreSlim nodeStartLock = new(1, 1);
    private readonly NotifyIcon trayIcon;
    private readonly ToolStripMenuItem musicModeItem;
    private readonly ToolStripMenuItem screenModeItem;
    private readonly ToolStripMenuItem currentAudioItem;
    private readonly ToolStripMenuItem bandsAudioItem;
    private readonly ToolStripMenuItem spectrumAudioItem;
    private Process? nodeProcess;

    public TrayApplicationContext()
    {
        musicModeItem = MenuItem("Music", async () => await SetModeAsync("music"));
        screenModeItem = MenuItem("Screen capture", async () => await SetModeAsync("screen-capture"));
        currentAudioItem = MenuItem("Current", async () => await SetAudioModeAsync("current"));
        bandsAudioItem = MenuItem("Band", async () => await SetAudioModeAsync("bands"));
        spectrumAudioItem = MenuItem("Spectrum", async () => await SetAudioModeAsync("spectrum"));

        var menu = new ContextMenuStrip();
        menu.Items.Add(MenuItem("Open settings", OpenSettingsAsync));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Mode", null, musicModeItem, screenModeItem));
        menu.Items.Add(new ToolStripMenuItem(
            "Audio mode",
            null,
            currentAudioItem,
            bandsAudioItem,
            spectrumAudioItem
        ));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(MenuItem("Shutdown", ShutdownAsync));

        trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Screenshoteer",
            ContextMenuStrip = menu,
            Visible = true,
        };
        trayIcon.MouseClick += async (_, eventArgs) =>
        {
            if (eventArgs.Button == MouseButtons.Left)
            {
                await OpenSettingsAsync();
            }
        };

        _ = EnsureNodeAppAsync();
    }

    protected override void ExitThreadCore()
    {
        trayIcon.Visible = false;
        trayIcon.Dispose();
        http.Dispose();
        nodeStartLock.Dispose();
        nodeProcess?.Dispose();
        base.ExitThreadCore();
    }

    private static ToolStripMenuItem MenuItem(string text, Func<Task> action)
    {
        var item = new ToolStripMenuItem(text);
        item.Click += async (_, _) => await action();
        return item;
    }

    private async Task EnsureNodeAppAsync()
    {
        await nodeStartLock.WaitAsync();
        try
        {
            if (await IsNodeAppAvailableAsync()) return;
            var projectRoot = FindProjectRoot();
            var startInfo = new ProcessStartInfo
            {
                FileName = "node",
                WorkingDirectory = projectRoot,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };
            startInfo.ArgumentList.Add(Path.Combine(projectRoot, "src", "launcher.ts"));
            nodeProcess = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Node did not start");

            for (var attempt = 0; attempt < 30; attempt++)
            {
                await Task.Delay(200);
                if (await IsNodeAppAvailableAsync()) return;
                if (nodeProcess.HasExited) break;
            }
            ShowError("The Node application did not become ready.");
        }
        catch (Exception error)
        {
            ShowError($"Could not start Screenshoteer:\n{error.Message}");
        }
        finally
        {
            nodeStartLock.Release();
        }
    }

    private async Task<bool> IsNodeAppAvailableAsync()
    {
        try
        {
            using var response = await http.GetAsync(SettingsApi);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task OpenSettingsAsync()
    {
        await EnsureNodeAppAsync();
        Process.Start(new ProcessStartInfo(SettingsUrl) { UseShellExecute = true });
    }

    private async Task SetModeAsync(string mode)
    {
        if (!await SendCommandAsync(new { command = "mode", value = mode })) return;
        musicModeItem.Checked = mode == "music";
        screenModeItem.Checked = mode == "screen-capture";
    }

    private async Task SetAudioModeAsync(string mode)
    {
        if (!await SendCommandAsync(new { command = "audiomode", value = mode })) return;
        currentAudioItem.Checked = mode == "current";
        bandsAudioItem.Checked = mode == "bands";
        spectrumAudioItem.Checked = mode == "spectrum";
    }

    private async Task<bool> SendCommandAsync(object command)
    {
        try
        {
            await EnsureNodeAppAsync();
            using var response = await http.PostAsJsonAsync(CommandApi, command);
            response.EnsureSuccessStatusCode();
            return true;
        }
        catch (Exception error)
        {
            ShowError($"Could not send command:\n{error.Message}");
            return false;
        }
    }

    private async Task ShutdownAsync()
    {
        await SendCommandAsync(new { command = "shutdown" });
        ExitThread();
    }

    private static string FindProjectRoot()
    {
        var configured = Environment.GetEnvironmentVariable("SCREENSHOTEER_ROOT");
        if (!string.IsNullOrWhiteSpace(configured) && IsProjectRoot(configured)) {
            return Path.GetFullPath(configured);
        }

        foreach (var start in new[] { Environment.CurrentDirectory, AppContext.BaseDirectory })
        {
            var directory = new DirectoryInfo(start);
            while (directory is not null)
            {
                if (IsProjectRoot(directory.FullName)) return directory.FullName;
                directory = directory.Parent;
            }
        }
        throw new DirectoryNotFoundException(
            "Screenshoteer project was not found. Set SCREENSHOTEER_ROOT to the project folder."
        );
    }

    private static bool IsProjectRoot(string path) =>
        File.Exists(Path.Combine(path, "package.json"))
        && File.Exists(Path.Combine(path, "src", "launcher.ts"));

    private static void ShowError(string message) => MessageBox.Show(
        message,
        "Screenshoteer",
        MessageBoxButtons.OK,
        MessageBoxIcon.Error
    );
}

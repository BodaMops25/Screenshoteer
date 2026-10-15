import { prepareSeaRuntime } from './sea-runtime.ts';

prepareSeaRuntime();

if (process.argv.includes('--sea-smoke-test')) {
    process.stdout.write('Screenshoteer SEA startup OK\n');
} else {
    const restartArgument = process.argv.find((argument) => argument.startsWith('--restart-after-pid='));
    const previousPid = restartArgument
        ? Number.parseInt(restartArgument.slice('--restart-after-pid='.length), 10)
        : undefined;

    void waitForProcessExit(previousPid).then(() => import('./index.ts'));
}

async function waitForProcessExit(pid: number | undefined): Promise<void> {
    if (!pid || !Number.isInteger(pid) || pid <= 0) return;

    while (isProcessRunning(pid)) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

function isProcessRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

import { prepareSeaRuntime } from './sea-runtime.ts';

prepareSeaRuntime();

if (process.argv.includes('--sea-smoke-test')) {
    console.log('Screenshoteer SEA startup OK');
} else {
    void import('./index.ts');
}

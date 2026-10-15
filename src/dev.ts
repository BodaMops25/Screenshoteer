declare const __DEV__: boolean;

// Direct TypeScript execution has no injected constant, so it is development mode.
// esbuild replaces __DEV__ with false and removes guarded blocks from SEA bundles.
export const DEV = typeof __DEV__ === 'undefined' ? true : __DEV__;

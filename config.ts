export const WLED_HOST = '192.168.1.18';
export const WLED_PORT = 4048;

export const FPS = 60
export const TIMEOUT_TO_SET_NO_MUSIC_MS = 30

// Low-level LED calibration. Values at or below each black point become 0.
// The curve rejoins the unmodified RGB value at LED_MATCH_POINT.
export const LED_BLACK_POINTS = [24, 24, 24] as const
export const LED_LOW_RANGE_GAMMAS = [1.5, 1.5, 1.5] as const
export const LED_MATCH_POINT = 128

export const DEBUG_WS_SIMULATION = true
export const DEBUG_NO_WLED = false
export const DEBUG_LED_COUNT = 300
export const DEBUG_LOGS = true
export const DEBUG_LOGS_INTERVAL = 10

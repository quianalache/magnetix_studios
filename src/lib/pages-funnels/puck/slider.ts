export const SLIDER_INTERVAL_MIN_SECONDS = 3;
export const SLIDER_INTERVAL_MAX_SECONDS = 60;
export const SLIDER_INTERVAL_DEFAULT_SECONDS = 5;

export function clampSliderIntervalMs(value: number): number {
  const seconds = Math.min(
    SLIDER_INTERVAL_MAX_SECONDS,
    Math.max(SLIDER_INTERVAL_MIN_SECONDS, Math.round(value / 1000)),
  );
  return seconds * 1000;
}

export function sliderIntervalMsToSeconds(value: number): number {
  return Math.min(
    SLIDER_INTERVAL_MAX_SECONDS,
    Math.max(SLIDER_INTERVAL_MIN_SECONDS, Math.round(value / 1000)),
  );
}

export function sliderIntervalSecondsToMs(value: number): number {
  return clampSliderIntervalMs(value * 1000);
}

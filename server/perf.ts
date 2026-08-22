export function isPerfLoggingEnabled() {
  return process.env.NODE_ENV === "development" || process.env.PERF_LOGGING_ENABLED === "true";
}

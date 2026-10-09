export function assertDevelopmentOnly() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("DEV actions are development-only.");
  }
}

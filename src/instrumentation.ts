/** Runs once when a server instance starts: refuse to boot with a readable message if required env vars are missing. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnvOnBoot } = await import("./lib/env");
  validateEnvOnBoot();
}

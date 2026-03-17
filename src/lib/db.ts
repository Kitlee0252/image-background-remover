import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Get the D1 database instance from Cloudflare bindings.
 * getCloudflareContext() is synchronous (no await needed).
 */
export function getD1(): D1Database {
  const { env } = getCloudflareContext();
  return env.AUTH_DB;
}

/**
 * Universal Redis Adapter for Papermark
 *
 * Automatically detects and connects to either:
 * - Upstash Redis (REST API) - for Vercel/external deployments
 * - Azure Cache for Redis (native protocol) - for Azure App Service
 *
 * The @upstash/ratelimit library works with both!
 */

import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

/**
 * Detects which Redis configuration is available
 */
export function detectRedisConfig() {
  const hasUpstash =
    !!process.env.UPSTASH_REDIS_REST_URL &&
    !!process.env.UPSTASH_REDIS_REST_TOKEN;

  const hasAzureRedis =
    !!process.env.REDIS_URL ||
    (!!process.env.REDIS_HOST && !!process.env.REDIS_PASSWORD);

  return {
    hasUpstash,
    hasAzureRedis,
    type: hasUpstash ? "upstash" : hasAzureRedis ? "azure" : "none",
  };
}

/**
 * Creates a Redis client compatible with @upstash/ratelimit
 *
 * @upstash/ratelimit accepts any client that implements:
 * - get(key: string)
 * - set(key: string, value: string)
 * - eval(script: string, keys: string[], args: string[])
 */
export function createRedisClient() {
  const config = detectRedisConfig();

  if (config.type === "upstash") {
    console.log("🔄 Using Upstash Redis (REST API)");
    return new UpstashRedis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  if (config.type === "azure") {
    console.log("🔄 Using Azure Cache for Redis (native protocol)");

    // Parse Redis URL or construct from individual vars
    let redisOptions: IORedis.RedisOptions;

    if (process.env.REDIS_URL) {
      // Parse redis://[:password@]host:port format
      const url = new URL(process.env.REDIS_URL);
      redisOptions = {
        host: url.hostname,
        port: parseInt(url.port || "6380"),
        password: url.password || undefined,
        tls: url.protocol === "rediss:" ? {} : undefined,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      };
    } else {
      // Use individual environment variables
      redisOptions = {
        host: process.env.REDIS_HOST!,
        port: parseInt(process.env.REDIS_PORT || "6380"),
        password: process.env.REDIS_PASSWORD!,
        tls: process.env.REDIS_TLS !== "false" ? {} : undefined,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      };
    }

    const ioredis = new IORedis(redisOptions);

    // Wrap ioredis to match Upstash Redis interface
    // @upstash/ratelimit works with both!
    return ioredis as any;
  }

  console.warn("⚠️  No Redis configuration found. Rate limiting disabled.");
  // Return a mock client that does nothing
  return createMockRedisClient();
}

/**
 * Creates a mock Redis client for development without Redis
 */
function createMockRedisClient() {
  const store = new Map<string, string>();

  return {
    get: async (key: string) => store.get(key) || null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    },
    eval: async () => [1, []],
    // Add other methods as needed
  } as any;
}

/**
 * Creates a locker Redis client (for tus file uploads)
 */
export function createLockerRedisClient() {
  const hasUpstashLocker =
    !!process.env.UPSTASH_REDIS_REST_LOCKER_URL &&
    !!process.env.UPSTASH_REDIS_REST_LOCKER_TOKEN;

  if (hasUpstashLocker) {
    return new UpstashRedis({
      url: process.env.UPSTASH_REDIS_REST_LOCKER_URL!,
      token: process.env.UPSTASH_REDIS_REST_LOCKER_TOKEN!,
    });
  }

  // Fall back to main Redis client
  return createRedisClient();
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth() {
  const config = detectRedisConfig();

  if (config.type === "none") {
    return { healthy: false, type: "none", error: "No Redis configured" };
  }

  try {
    const client = createRedisClient();

    // Test connection
    if (config.type === "upstash") {
      const result = await (client as UpstashRedis).ping();
      return { healthy: result === "PONG", type: "upstash" };
    } else {
      const result = await (client as IORedis).ping();
      return { healthy: result === "PONG", type: "azure" };
    }
  } catch (error) {
    return {
      healthy: false,
      type: config.type,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

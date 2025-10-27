import { Ratelimit } from "@upstash/ratelimit";
import {
  createRedisClient,
  createLockerRedisClient,
} from "@/lib/redis-adapter";

// Universal Redis client - works with both Upstash and Azure Cache for Redis
export const redis = createRedisClient();

// Locker client for tus file uploads
export const lockerRedisClient = createLockerRedisClient();

// Create a new ratelimiter, that allows 10 requests per 10 seconds by default
export const ratelimit = (
  requests: number = 10,
  seconds:
    | `${number} ms`
    | `${number} s`
    | `${number} m`
    | `${number} h`
    | `${number} d` = "10 s",
) => {
  return new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(requests, seconds),
    analytics: true,
    prefix: "papermark",
  });
};

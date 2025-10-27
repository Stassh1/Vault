import { NextApiRequest, NextApiResponse } from "next";

import { checkRedisHealth } from "@/lib/redis-adapter";

/**
 * Redis health check endpoint
 * GET /api/health/redis
 *
 * Returns the status of Redis connection
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const health = await checkRedisHealth();

    if (health.healthy) {
      return res.status(200).json({
        status: "healthy",
        type: health.type,
        message: `Redis (${health.type}) is connected and operational`,
      });
    } else {
      return res.status(503).json({
        status: "unhealthy",
        type: health.type,
        error: health.error,
        message: "Redis connection failed",
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Failed to check Redis health",
    });
  }
}

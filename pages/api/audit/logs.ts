import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import prisma from "@/lib/prisma";

/**
 * Audit Logs API
 *
 * GET /api/audit/logs - Query audit logs
 *
 * Query parameters:
 * - eventType: Filter by event type
 * - startDate: Start date (ISO string)
 * - endDate: End date (ISO string)
 * - actorEmail: Filter by actor email
 * - targetId: Filter by target resource ID
 * - teamId: Filter by team ID
 * - limit: Number of results (default 100, max 1000)
 * - offset: Pagination offset
 *
 * Note: This queries the local database. For full Purview queries,
 * use Azure Portal or Purview Studio.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Check authentication
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Note: In production, you might want to create an AuditLog table in Prisma
    // For now, return info about Purview integration
    const {
      eventType,
      startDate,
      endDate,
      actorEmail,
      targetId,
      teamId,
      limit = "100",
      offset = "0",
    } = req.query;

    return res.status(200).json({
      message: "Audit logs are being sent to Azure Purview",
      info: {
        purviewEnabled: process.env.PURVIEW_ENABLED === "true",
        monitorEnabled: process.env.PURVIEW_MONITOR_ENABLED === "true",
        purviewAccount: process.env.PURVIEW_ACCOUNT_NAME,
      },
      instructions: {
        azurePortal: "View logs in Azure Portal > Monitor > Logs",
        purviewStudio: "View data governance in Microsoft Purview Studio",
        kql: `
// Example KQL query for Azure Monitor:
AuditLogs
| where TimeGenerated between (datetime(${startDate || "now(-7d)"}) .. datetime(${endDate || "now()"}))
${eventType ? `| where EventType == "${eventType}"` : ""}
${actorEmail ? `| where ActorEmail == "${actorEmail}"` : ""}
${targetId ? `| where TargetId == "${targetId}"` : ""}
${teamId ? `| where TeamId == "${teamId}"` : ""}
| order by TimeGenerated desc
| take ${limit}
        `.trim(),
      },
      note: "To query audit logs programmatically, use Azure Monitor Query API",
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
}

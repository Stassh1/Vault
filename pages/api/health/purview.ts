import { NextApiRequest, NextApiResponse } from "next";

/**
 * Purview Health Check Endpoint
 * GET /api/health/purview
 *
 * Returns the status of Azure Purview integration
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = {
      enabled: process.env.PURVIEW_ENABLED === "true",
      accountName: process.env.PURVIEW_ACCOUNT_NAME,
      catalogEndpoint: process.env.PURVIEW_CATALOG_ENDPOINT,
      monitorEnabled: process.env.PURVIEW_MONITOR_ENABLED === "true",
      useManagedIdentity: process.env.PURVIEW_USE_MANAGED_IDENTITY !== "false",
    };

    if (!config.enabled) {
      return res.status(200).json({
        status: "disabled",
        message: "Azure Purview integration is not enabled",
        config: {
          enabled: false,
        },
      });
    }

    if (!config.accountName) {
      return res.status(503).json({
        status: "misconfigured",
        error: "PURVIEW_ACCOUNT_NAME is not set",
        message: "Purview is enabled but not configured properly",
      });
    }

    // Check if we can initialize clients
    try {
      const { getPurviewClient } = await import("@/lib/purview/client");
      const client = getPurviewClient();

      return res.status(200).json({
        status: "healthy",
        message: "Azure Purview integration is active",
        config: {
          enabled: true,
          accountName: config.accountName,
          catalogEndpoint: config.catalogEndpoint,
          monitorEnabled: config.monitorEnabled,
          authentication: config.useManagedIdentity
            ? "Managed Identity"
            : "Service Principal",
        },
        features: {
          auditLogging: true,
          dataGovernance: !!config.catalogEndpoint,
          monitorIngestion: config.monitorEnabled,
          dataLineage: !!config.catalogEndpoint,
        },
        endpoints: {
          auditLogs: "/api/audit/logs",
          purviewStudio: `https://web.purview.azure.com/resource/${config.accountName}`,
          azurePortal: `https://portal.azure.com/#@/resource/subscriptions/.../resourceGroups/.../providers/Microsoft.Purview/accounts/${config.accountName}`,
        },
      });
    } catch (error) {
      return res.status(503).json({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to initialize Purview client",
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Failed to check Purview health",
    });
  }
}

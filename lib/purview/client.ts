/**
 * Azure Purview Client for Audit Logging and Data Governance
 *
 * This client sends audit events to:
 * 1. Azure Purview for data governance and lineage
 * 2. Azure Monitor for centralized logging
 * 3. Local PostgreSQL for quick queries (optional)
 */

import { DefaultAzureCredential, ClientSecretCredential } from "@azure/identity";
import { LogsIngestionClient } from "@azure/monitor-ingestion";
import { PurviewCatalog } from "@azure/purview-catalog";
import { AuditEvent, PurviewConfig, DataLineage } from "./types";
import { nanoid } from "nanoid";

class PurviewClient {
  private config: PurviewConfig;
  private catalogClient?: PurviewCatalog;
  private monitorClient?: LogsIngestionClient;
  private eventBuffer: AuditEvent[] = [];
  private bufferFlushInterval?: NodeJS.Timeout;

  constructor() {
    this.config = this.loadConfig();

    if (this.config.enabled) {
      this.initializeClients();
      this.startBufferFlush();
    }
  }

  /**
   * Load Purview configuration from environment
   */
  private loadConfig(): PurviewConfig {
    return {
      enabled: process.env.PURVIEW_ENABLED === "true",
      accountName: process.env.PURVIEW_ACCOUNT_NAME,
      catalogEndpoint: process.env.PURVIEW_CATALOG_ENDPOINT ||
        (process.env.PURVIEW_ACCOUNT_NAME
          ? `https://${process.env.PURVIEW_ACCOUNT_NAME}.purview.azure.com`
          : undefined),
      managedIdentity: process.env.PURVIEW_USE_MANAGED_IDENTITY !== "false",
      clientId: process.env.PURVIEW_CLIENT_ID,
      clientSecret: process.env.PURVIEW_CLIENT_SECRET,
      tenantId: process.env.PURVIEW_TENANT_ID || process.env.AZURE_AD_TENANT_ID,

      // Azure Monitor configuration
      monitorEnabled: process.env.PURVIEW_MONITOR_ENABLED === "true",
      dataCollectionEndpoint: process.env.PURVIEW_DATA_COLLECTION_ENDPOINT,
      dataCollectionRuleId: process.env.PURVIEW_DATA_COLLECTION_RULE_ID,
      streamName: process.env.PURVIEW_STREAM_NAME || "Custom-AuditLogs",
    };
  }

  /**
   * Initialize Azure Purview and Monitor clients
   */
  private initializeClients() {
    try {
      // Get credential
      const credential = this.getCredential();

      // Initialize Purview Catalog client
      if (this.config.catalogEndpoint) {
        this.catalogClient = new PurviewCatalog(
          this.config.catalogEndpoint,
          credential
        );
        console.log("✅ Purview Catalog client initialized");
      }

      // Initialize Azure Monitor client
      if (
        this.config.monitorEnabled &&
        this.config.dataCollectionEndpoint
      ) {
        this.monitorClient = new LogsIngestionClient(
          this.config.dataCollectionEndpoint,
          credential
        );
        console.log("✅ Azure Monitor ingestion client initialized");
      }
    } catch (error) {
      console.error("Failed to initialize Purview clients:", error);
    }
  }

  /**
   * Get appropriate Azure credential
   */
  private getCredential() {
    if (this.config.managedIdentity) {
      return new DefaultAzureCredential();
    }

    if (
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.tenantId
    ) {
      return new ClientSecretCredential(
        this.config.tenantId,
        this.config.clientId,
        this.config.clientSecret
      );
    }

    throw new Error("No valid Azure credential configuration found");
  }

  /**
   * Log an audit event
   */
  async logEvent(event: Omit<AuditEvent, "eventId" | "eventTime">): Promise<void> {
    if (!this.config.enabled) {
      // If Purview is disabled, just log to console in dev
      if (process.env.NODE_ENV === "development") {
        console.log("[Audit]", event.eventType, event);
      }
      return;
    }

    const fullEvent: AuditEvent = {
      ...event,
      eventId: nanoid(),
      eventTime: new Date(),
    };

    // Add to buffer for batch processing
    this.eventBuffer.push(fullEvent);

    // If critical event, flush immediately
    if (fullEvent.severity === "CRITICAL" || fullEvent.severity === "ERROR") {
      await this.flushEvents();
    }
  }

  /**
   * Send events to Azure Monitor
   */
  private async sendToMonitor(events: AuditEvent[]): Promise<void> {
    if (!this.monitorClient || !this.config.dataCollectionRuleId) {
      return;
    }

    try {
      // Transform events to Monitor format
      const monitorLogs = events.map((event) => ({
        TimeGenerated: event.eventTime.toISOString(),
        EventId: event.eventId,
        EventType: event.eventType,
        Severity: event.severity,
        ActorId: event.actorId,
        ActorEmail: event.actorEmail,
        ActorType: event.actorType,
        ActorIP: event.actorIpAddress,
        TargetType: event.targetType,
        TargetId: event.targetId,
        TargetName: event.targetName,
        TeamId: event.teamId,
        Action: event.action,
        Description: event.description,
        AzureTenantId: event.azureTenantId,
        Metadata: JSON.stringify(event.metadata),
        DataClassification: event.dataClassification,
        ComplianceFlags: event.complianceFlags?.join(","),
      }));

      await this.monitorClient.upload(
        this.config.dataCollectionRuleId,
        this.config.streamName!,
        monitorLogs
      );

      console.log(`✅ Sent ${events.length} events to Azure Monitor`);
    } catch (error) {
      console.error("Failed to send events to Azure Monitor:", error);
    }
  }

  /**
   * Create or update asset in Purview Catalog
   */
  async registerAsset(asset: {
    id: string;
    name: string;
    type: "document" | "dataroom" | "link";
    owner: string;
    description?: string;
    classification?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    if (!this.catalogClient) {
      return;
    }

    try {
      const assetData = {
        typeName: `papermark_${asset.type}`,
        attributes: {
          qualifiedName: `papermark://${asset.type}/${asset.id}`,
          name: asset.name,
          owner: asset.owner,
          description: asset.description,
          classification: asset.classification,
          createTime: new Date().getTime(),
          ...asset.metadata,
        },
        guid: asset.id,
      };

      // Register asset in catalog
      await this.catalogClient.path("/atlas/v2/entity").post({
        body: {
          entity: assetData,
        },
      });

      console.log(`✅ Registered asset in Purview: ${asset.name}`);
    } catch (error) {
      console.error("Failed to register asset in Purview:", error);
    }
  }

  /**
   * Track data lineage
   */
  async trackLineage(lineage: DataLineage): Promise<void> {
    if (!this.catalogClient) {
      return;
    }

    try {
      // Create lineage relationships in Purview
      const processes = lineage.upstreamAssets.map((upstream) => ({
        typeName: "Process",
        attributes: {
          qualifiedName: `papermark://process/${lineage.assetId}_${upstream.id}`,
          name: `${upstream.name} → ${lineage.assetName}`,
          inputs: [
            {
              guid: upstream.id,
              typeName: `papermark_${upstream.type}`,
            },
          ],
          outputs: [
            {
              guid: lineage.assetId,
              typeName: `papermark_${lineage.assetType}`,
            },
          ],
        },
      }));

      if (processes.length > 0) {
        await this.catalogClient.path("/atlas/v2/entity/bulk").post({
          body: {
            entities: processes,
          },
        });

        console.log(`✅ Tracked lineage for: ${lineage.assetName}`);
      }
    } catch (error) {
      console.error("Failed to track lineage in Purview:", error);
    }
  }

  /**
   * Flush buffered events
   */
  private async flushEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Send to Azure Monitor
      if (this.config.monitorEnabled) {
        await this.sendToMonitor(events);
      }

      // Optionally store in local database for quick queries
      // This could be done via Prisma if needed
    } catch (error) {
      console.error("Failed to flush audit events:", error);
      // Re-add events to buffer on failure
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Start periodic buffer flush
   */
  private startBufferFlush() {
    // Flush every 10 seconds or when buffer reaches 100 events
    this.bufferFlushInterval = setInterval(() => {
      if (this.eventBuffer.length > 0) {
        this.flushEvents();
      }
    }, 10000);
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }
    this.flushEvents(); // Final flush
  }
}

// Singleton instance
let purviewClientInstance: PurviewClient | null = null;

export function getPurviewClient(): PurviewClient {
  if (!purviewClientInstance) {
    purviewClientInstance = new PurviewClient();
  }
  return purviewClientInstance;
}

export { PurviewClient };

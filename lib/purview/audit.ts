/**
 * Audit Service - Convenience methods for logging events
 */

import { getPurviewClient } from "./client";
import {
  AuditEventType,
  AuditSeverity,
  AuditEvent,
} from "./types";
import { NextApiRequest } from "next";

/**
 * Extract actor information from request
 */
function getActorFromRequest(req?: NextApiRequest | Request) {
  if (!req) {
    return {};
  }

  let ipAddress: string | undefined;
  let userAgent: string | undefined;

  if ("headers" in req && typeof req.headers.get === "function") {
    // Standard Request object
    ipAddress =
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      undefined;
    userAgent = req.headers.get("user-agent") || undefined;
  } else {
    // NextApiRequest
    const nextReq = req as NextApiRequest;
    const forwarded = nextReq.headers["x-forwarded-for"];
    ipAddress = typeof forwarded === "string"
      ? forwarded.split(",")[0]
      : Array.isArray(forwarded)
      ? forwarded[0]
      : nextReq.headers["x-real-ip"] as string || undefined;
    userAgent = nextReq.headers["user-agent"];
  }

  return {
    actorIpAddress: ipAddress,
    actorUserAgent: userAgent,
  };
}

/**
 * Audit Service
 */
export class AuditService {
  private client = getPurviewClient();

  /**
   * Log a user authentication event
   */
  async logAuth(params: {
    eventType:
      | AuditEventType.USER_LOGIN
      | AuditEventType.USER_LOGOUT
      | AuditEventType.USER_SIGNUP
      | AuditEventType.USER_LOGIN_FAILED
      | AuditEventType.AZURE_B2B_GUEST_INVITED
      | AuditEventType.AZURE_B2B_GUEST_ACCEPTED;
    userId?: string;
    email?: string;
    azureTenantId?: string;
    userType?: "user" | "guest";
    req?: NextApiRequest | Request;
    metadata?: Record<string, any>;
  }) {
    await this.client.logEvent({
      eventType: params.eventType,
      severity: params.eventType === AuditEventType.USER_LOGIN_FAILED
        ? AuditSeverity.WARNING
        : AuditSeverity.INFO,
      actorId: params.userId,
      actorEmail: params.email,
      actorType: params.userType,
      azureTenantId: params.azureTenantId,
      action: params.eventType,
      description: `User ${params.eventType}`,
      metadata: params.metadata,
      ...getActorFromRequest(params.req),
    });
  }

  /**
   * Log a document event
   */
  async logDocument(params: {
    eventType:
      | AuditEventType.DOCUMENT_CREATED
      | AuditEventType.DOCUMENT_UPDATED
      | AuditEventType.DOCUMENT_DELETED
      | AuditEventType.DOCUMENT_VIEWED
      | AuditEventType.DOCUMENT_DOWNLOADED
      | AuditEventType.DOCUMENT_SHARED
      | AuditEventType.DOCUMENT_UPLOADED;
    documentId: string;
    documentName: string;
    userId?: string;
    userEmail?: string;
    teamId?: string;
    viewerId?: string; // For guest/viewer access
    classification?: string;
    req?: NextApiRequest | Request;
    metadata?: Record<string, any>;
  }) {
    await this.client.logEvent({
      eventType: params.eventType,
      severity: AuditSeverity.INFO,
      actorId: params.userId || params.viewerId,
      actorEmail: params.userEmail,
      actorType: params.userId ? "user" : "guest",
      targetType: "document",
      targetId: params.documentId,
      targetName: params.documentName,
      teamId: params.teamId,
      action: params.eventType,
      description: `Document ${params.eventType}: ${params.documentName}`,
      dataClassification: params.classification,
      metadata: params.metadata,
      ...getActorFromRequest(params.req),
    });

    // Register asset in Purview for governance
    if (
      params.eventType === AuditEventType.DOCUMENT_CREATED ||
      params.eventType === AuditEventType.DOCUMENT_UPLOADED
    ) {
      await this.client.registerAsset({
        id: params.documentId,
        name: params.documentName,
        type: "document",
        owner: params.userEmail || "unknown",
        classification: params.classification,
        metadata: params.metadata,
      });
    }
  }

  /**
   * Log a link event
   */
  async logLink(params: {
    eventType:
      | AuditEventType.LINK_CREATED
      | AuditEventType.LINK_ACCESSED
      | AuditEventType.LINK_EXPIRED
      | AuditEventType.LINK_REVOKED;
    linkId: string;
    linkName?: string;
    documentId?: string;
    documentName?: string;
    userId?: string;
    userEmail?: string;
    viewerEmail?: string;
    teamId?: string;
    req?: NextApiRequest | Request;
    metadata?: Record<string, any>;
  }) {
    await this.client.logEvent({
      eventType: params.eventType,
      severity: params.eventType === AuditEventType.LINK_REVOKED
        ? AuditSeverity.WARNING
        : AuditSeverity.INFO,
      actorId: params.userId,
      actorEmail: params.userEmail || params.viewerEmail,
      actorType: params.userId ? "user" : "guest",
      targetType: "link",
      targetId: params.linkId,
      targetName: params.linkName || `Link to ${params.documentName}`,
      teamId: params.teamId,
      action: params.eventType,
      description: `Link ${params.eventType}`,
      parentResourceId: params.documentId,
      lineageType: "created_from",
      metadata: params.metadata,
      ...getActorFromRequest(params.req),
    });
  }

  /**
   * Log a dataroom event
   */
  async logDataroom(params: {
    eventType:
      | AuditEventType.DATAROOM_CREATED
      | AuditEventType.DATAROOM_ACCESSED
      | AuditEventType.DATAROOM_DOCUMENT_ADDED
      | AuditEventType.DATAROOM_DOCUMENT_REMOVED
      | AuditEventType.DATAROOM_VIEWER_INVITED;
    dataroomId: string;
    dataroomName: string;
    userId?: string;
    userEmail?: string;
    viewerEmail?: string;
    teamId?: string;
    documentId?: string;
    documentName?: string;
    req?: NextApiRequest | Request;
    metadata?: Record<string, any>;
  }) {
    await this.client.logEvent({
      eventType: params.eventType,
      severity: AuditSeverity.INFO,
      actorId: params.userId,
      actorEmail: params.userEmail || params.viewerEmail,
      actorType: params.userId ? "user" : "guest",
      targetType: "dataroom",
      targetId: params.dataroomId,
      targetName: params.dataroomName,
      teamId: params.teamId,
      action: params.eventType,
      description: `Dataroom ${params.eventType}: ${params.dataroomName}`,
      metadata: {
        ...params.metadata,
        documentId: params.documentId,
        documentName: params.documentName,
      },
      ...getActorFromRequest(params.req),
    });
  }

  /**
   * Log a team event
   */
  async logTeam(params: {
    eventType:
      | AuditEventType.TEAM_CREATED
      | AuditEventType.TEAM_MEMBER_ADDED
      | AuditEventType.TEAM_MEMBER_REMOVED
      | AuditEventType.TEAM_ROLE_CHANGED;
    teamId: string;
    teamName: string;
    userId: string;
    userEmail: string;
    targetUserId?: string;
    targetUserEmail?: string;
    role?: string;
    req?: NextApiRequest | Request;
    metadata?: Record<string, any>;
  }) {
    await this.client.logEvent({
      eventType: params.eventType,
      severity: AuditSeverity.INFO,
      actorId: params.userId,
      actorEmail: params.userEmail,
      actorType: "user",
      targetType: "team",
      targetId: params.teamId,
      targetName: params.teamName,
      teamId: params.teamId,
      action: params.eventType,
      description: `Team ${params.eventType}`,
      metadata: {
        ...params.metadata,
        targetUserId: params.targetUserId,
        targetUserEmail: params.targetUserEmail,
        role: params.role,
      },
      ...getActorFromRequest(params.req),
    });
  }

  /**
   * Log a security event
   */
  async logSecurity(params: {
    eventType:
      | AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT
      | AuditEventType.RATE_LIMIT_EXCEEDED
      | AuditEventType.SUSPICIOUS_ACTIVITY
      | AuditEventType.POLICY_VIOLATION;
    userId?: string;
    userEmail?: string;
    description: string;
    req?: NextApiRequest | Request;
    metadata?: Record<string, any>;
  }) {
    await this.client.logEvent({
      eventType: params.eventType,
      severity: AuditSeverity.WARNING,
      actorId: params.userId,
      actorEmail: params.userEmail,
      action: params.eventType,
      description: params.description,
      metadata: params.metadata,
      ...getActorFromRequest(params.req),
    });
  }

  /**
   * Log a compliance event
   */
  async logCompliance(params: {
    eventType:
      | AuditEventType.DATA_EXPORT
      | AuditEventType.DATA_DELETION
      | AuditEventType.PRIVACY_REQUEST;
    userId: string;
    userEmail: string;
    description: string;
    complianceFlags?: string[];
    req?: NextApiRequest | Request;
    metadata?: Record<string, any>;
  }) {
    await this.client.logEvent({
      eventType: params.eventType,
      severity: AuditSeverity.WARNING,
      actorId: params.userId,
      actorEmail: params.userEmail,
      actorType: "user",
      action: params.eventType,
      description: params.description,
      complianceFlags: params.complianceFlags,
      metadata: params.metadata,
      ...getActorFromRequest(params.req),
    });
  }

  /**
   * Track data lineage
   */
  async trackLineage(params: {
    assetId: string;
    assetName: string;
    assetType: "document" | "dataroom" | "link";
    createdBy: string;
    upstreamAssets?: Array<{
      id: string;
      name: string;
      type: string;
      relationshipType: string;
    }>;
    accessCount?: number;
  }) {
    await this.client.trackLineage({
      assetId: params.assetId,
      assetName: params.assetName,
      assetType: params.assetType,
      createdBy: params.createdBy,
      createdAt: new Date(),
      upstreamAssets: params.upstreamAssets || [],
      downstreamAssets: [],
      accessCount: params.accessCount || 0,
    });
  }
}

// Singleton instance
let auditServiceInstance: AuditService | null = null;

export function getAuditService(): AuditService {
  if (!auditServiceInstance) {
    auditServiceInstance = new AuditService();
  }
  return auditServiceInstance;
}

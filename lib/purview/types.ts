/**
 * Azure Purview Audit Event Types for Papermark
 */

export enum AuditEventType {
  // Authentication Events
  USER_LOGIN = "USER_LOGIN",
  USER_LOGOUT = "USER_LOGOUT",
  USER_SIGNUP = "USER_SIGNUP",
  USER_LOGIN_FAILED = "USER_LOGIN_FAILED",
  AZURE_B2B_GUEST_INVITED = "AZURE_B2B_GUEST_INVITED",
  AZURE_B2B_GUEST_ACCEPTED = "AZURE_B2B_GUEST_ACCEPTED",

  // Document Events
  DOCUMENT_CREATED = "DOCUMENT_CREATED",
  DOCUMENT_UPDATED = "DOCUMENT_UPDATED",
  DOCUMENT_DELETED = "DOCUMENT_DELETED",
  DOCUMENT_VIEWED = "DOCUMENT_VIEWED",
  DOCUMENT_DOWNLOADED = "DOCUMENT_DOWNLOADED",
  DOCUMENT_SHARED = "DOCUMENT_SHARED",
  DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED",

  // Link Events
  LINK_CREATED = "LINK_CREATED",
  LINK_ACCESSED = "LINK_ACCESSED",
  LINK_EXPIRED = "LINK_EXPIRED",
  LINK_REVOKED = "LINK_REVOKED",

  // Dataroom Events
  DATAROOM_CREATED = "DATAROOM_CREATED",
  DATAROOM_ACCESSED = "DATAROOM_ACCESSED",
  DATAROOM_DOCUMENT_ADDED = "DATAROOM_DOCUMENT_ADDED",
  DATAROOM_DOCUMENT_REMOVED = "DATAROOM_DOCUMENT_REMOVED",
  DATAROOM_VIEWER_INVITED = "DATAROOM_VIEWER_INVITED",

  // Team Events
  TEAM_CREATED = "TEAM_CREATED",
  TEAM_MEMBER_ADDED = "TEAM_MEMBER_ADDED",
  TEAM_MEMBER_REMOVED = "TEAM_MEMBER_REMOVED",
  TEAM_ROLE_CHANGED = "TEAM_ROLE_CHANGED",

  // Compliance Events
  DATA_EXPORT = "DATA_EXPORT",
  DATA_DELETION = "DATA_DELETION",
  PRIVACY_REQUEST = "PRIVACY_REQUEST",
  POLICY_VIOLATION = "POLICY_VIOLATION",

  // Security Events
  UNAUTHORIZED_ACCESS_ATTEMPT = "UNAUTHORIZED_ACCESS_ATTEMPT",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  SUSPICIOUS_ACTIVITY = "SUSPICIOUS_ACTIVITY",
}

export enum AuditSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  ERROR = "ERROR",
  CRITICAL = "CRITICAL",
}

export interface AuditEvent {
  // Event Identity
  eventId: string;
  eventType: AuditEventType;
  eventTime: Date;
  severity: AuditSeverity;

  // Actor (who performed the action)
  actorId?: string;
  actorEmail?: string;
  actorType?: "user" | "guest" | "system" | "api";
  actorIpAddress?: string;
  actorUserAgent?: string;
  azureTenantId?: string; // For B2B tracking

  // Target (what was affected)
  targetType?: "document" | "link" | "dataroom" | "team" | "user";
  targetId?: string;
  targetName?: string;

  // Context
  teamId?: string;
  sessionId?: string;
  requestId?: string;

  // Details
  action: string;
  description?: string;
  metadata?: Record<string, any>;

  // Compliance
  dataClassification?: string; // e.g., "confidential", "public", "internal"
  complianceFlags?: string[]; // e.g., ["GDPR", "HIPAA"]

  // Data Lineage
  parentResourceId?: string; // For tracking relationships
  lineageType?: "created_from" | "shared_from" | "copied_from";
}

export interface PurviewConfig {
  enabled: boolean;
  accountName?: string;
  catalogEndpoint?: string;
  managedIdentity: boolean;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;

  // Optional: Azure Monitor for logs ingestion
  monitorEnabled?: boolean;
  dataCollectionEndpoint?: string;
  dataCollectionRuleId?: string;
  streamName?: string;
}

export interface DataLineage {
  assetId: string;
  assetName: string;
  assetType: "document" | "dataroom" | "link";

  // Lineage relationships
  upstreamAssets: Array<{
    id: string;
    name: string;
    type: string;
    relationshipType: string;
  }>;

  downstreamAssets: Array<{
    id: string;
    name: string;
    type: string;
    relationshipType: string;
  }>;

  // Metadata
  createdBy: string;
  createdAt: Date;
  modifiedBy?: string;
  modifiedAt?: Date;

  // Access tracking
  accessCount: number;
  lastAccessedAt?: Date;
  lastAccessedBy?: string;
}

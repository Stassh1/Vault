/**
 * Example Integrations for Azure Purview Audit Logging
 *
 * These examples show how to integrate audit logging throughout Papermark.
 * Copy these patterns to your existing API routes and functions.
 */

import { NextApiRequest, NextApiResponse } from "next";
import { audit, AuditEventType } from "@/lib/purview";

// ============================================================================
// AUTHENTICATION EVENTS
// ============================================================================

/**
 * Example: Log user sign-in
 * Add to: pages/api/auth/[...nextauth].ts
 */
export async function logUserSignIn(user: any, req: NextApiRequest) {
  await audit.logAuth({
    eventType: AuditEventType.USER_LOGIN,
    userId: user.id,
    email: user.email,
    userType: user.userType === "Guest" ? "guest" : "user",
    azureTenantId: user.azureTenantId,
    req,
    metadata: {
      provider: "azure-ad", // or "google", "email", etc.
      isNewUser: false,
    },
  });
}

/**
 * Example: Log Azure B2B guest accepted invitation
 */
export async function logGuestAccepted(user: any, req: NextApiRequest) {
  await audit.logAuth({
    eventType: AuditEventType.AZURE_B2B_GUEST_ACCEPTED,
    userId: user.id,
    email: user.email,
    userType: "guest",
    azureTenantId: user.azureTenantId,
    req,
    metadata: {
      externalEmail: user.externalEmail,
      invitedBy: user.guestInviter,
    },
  });
}

// ============================================================================
// DOCUMENT EVENTS
// ============================================================================

/**
 * Example: Log document upload
 * Add to: Document upload API route
 */
export async function logDocumentUpload(
  document: any,
  user: any,
  teamId: string,
  req: NextApiRequest
) {
  await audit.logDocument({
    eventType: AuditEventType.DOCUMENT_UPLOADED,
    documentId: document.id,
    documentName: document.name,
    userId: user.id,
    userEmail: user.email,
    teamId,
    classification: document.type === "nda" ? "confidential" : "internal",
    req,
    metadata: {
      fileSize: document.size,
      fileType: document.type,
      numPages: document.numPages,
    },
  });

  // Track lineage
  await audit.trackLineage({
    assetId: document.id,
    assetName: document.name,
    assetType: "document",
    createdBy: user.email,
    accessCount: 0,
  });
}

/**
 * Example: Log document view
 * Add to: Document view API route (pages/api/views/route.ts)
 */
export async function logDocumentView(
  document: any,
  link: any,
  view: any,
  req: NextApiRequest
) {
  await audit.logDocument({
    eventType: AuditEventType.DOCUMENT_VIEWED,
    documentId: document.id,
    documentName: document.name,
    viewerId: view.id,
    userEmail: view.viewerEmail,
    teamId: link.teamId,
    req,
    metadata: {
      linkId: link.id,
      viewDuration: view.duration,
      pagesViewed: view.pages?.length,
    },
  });
}

/**
 * Example: Log document download
 */
export async function logDocumentDownload(
  document: any,
  user: any,
  req: NextApiRequest
) {
  await audit.logDocument({
    eventType: AuditEventType.DOCUMENT_DOWNLOADED,
    documentId: document.id,
    documentName: document.name,
    userId: user?.id,
    userEmail: user?.email || "anonymous",
    req,
    metadata: {
      fileType: document.type,
      fileSize: document.size,
    },
  });
}

// ============================================================================
// LINK EVENTS
// ============================================================================

/**
 * Example: Log link creation
 * Add to: Link creation API
 */
export async function logLinkCreation(
  link: any,
  document: any,
  user: any,
  teamId: string,
  req: NextApiRequest
) {
  await audit.logLink({
    eventType: AuditEventType.LINK_CREATED,
    linkId: link.id,
    linkName: link.name,
    documentId: document.id,
    documentName: document.name,
    userId: user.id,
    userEmail: user.email,
    teamId,
    req,
    metadata: {
      expiresAt: link.expiresAt,
      allowDownload: link.allowDownload,
      requireEmail: link.emailProtected,
      requirePassword: !!link.password,
    },
  });

  // Track lineage: link created from document
  await audit.trackLineage({
    assetId: link.id,
    assetName: link.name || `Link to ${document.name}`,
    assetType: "link",
    createdBy: user.email,
    upstreamAssets: [
      {
        id: document.id,
        name: document.name,
        type: "document",
        relationshipType: "created_from",
      },
    ],
  });
}

/**
 * Example: Log link access
 */
export async function logLinkAccess(
  link: any,
  viewerEmail?: string,
  req?: NextApiRequest
) {
  await audit.logLink({
    eventType: AuditEventType.LINK_ACCESSED,
    linkId: link.id,
    documentId: link.documentId,
    viewerEmail,
    req,
    metadata: {
      isPasswordProtected: !!link.password,
      isEmailVerified: !!viewerEmail,
    },
  });
}

// ============================================================================
// DATAROOM EVENTS
// ============================================================================

/**
 * Example: Log dataroom creation
 */
export async function logDataroomCreation(
  dataroom: any,
  user: any,
  teamId: string,
  req: NextApiRequest
) {
  await audit.logDataroom({
    eventType: AuditEventType.DATAROOM_CREATED,
    dataroomId: dataroom.id,
    dataroomName: dataroom.name,
    userId: user.id,
    userEmail: user.email,
    teamId,
    req,
    metadata: {
      pId: dataroom.pId,
    },
  });

  // Register dataroom as asset
  await audit.trackLineage({
    assetId: dataroom.id,
    assetName: dataroom.name,
    assetType: "dataroom",
    createdBy: user.email,
  });
}

/**
 * Example: Log document added to dataroom
 */
export async function logDataroomDocumentAdded(
  dataroom: any,
  document: any,
  user: any,
  req: NextApiRequest
) {
  await audit.logDataroom({
    eventType: AuditEventType.DATAROOM_DOCUMENT_ADDED,
    dataroomId: dataroom.id,
    dataroomName: dataroom.name,
    documentId: document.id,
    documentName: document.name,
    userId: user.id,
    userEmail: user.email,
    teamId: dataroom.teamId,
    req,
  });

  // Track lineage: document is now part of dataroom
  await audit.trackLineage({
    assetId: document.id,
    assetName: document.name,
    assetType: "document",
    createdBy: user.email,
    upstreamAssets: [
      {
        id: dataroom.id,
        name: dataroom.name,
        type: "dataroom",
        relationshipType: "part_of",
      },
    ],
  });
}

// ============================================================================
// SECURITY EVENTS
// ============================================================================

/**
 * Example: Log unauthorized access attempt
 */
export async function logUnauthorizedAccess(
  resource: string,
  userId?: string,
  req?: NextApiRequest
) {
  await audit.logSecurity({
    eventType: AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
    userId,
    description: `Unauthorized access attempt to ${resource}`,
    req,
    metadata: {
      resource,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Example: Log rate limit exceeded
 */
export async function logRateLimitExceeded(
  identifier: string,
  req?: NextApiRequest
) {
  await audit.logSecurity({
    eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
    description: `Rate limit exceeded for ${identifier}`,
    req,
    metadata: {
      identifier,
      timestamp: new Date().toISOString(),
    },
  });
}

// ============================================================================
// COMPLIANCE EVENTS
// ============================================================================

/**
 * Example: Log data export (GDPR compliance)
 */
export async function logDataExport(
  user: any,
  exportType: string,
  req: NextApiRequest
) {
  await audit.logCompliance({
    eventType: AuditEventType.DATA_EXPORT,
    userId: user.id,
    userEmail: user.email,
    description: `User requested data export: ${exportType}`,
    complianceFlags: ["GDPR", "DATA_PORTABILITY"],
    req,
    metadata: {
      exportType,
      requestedAt: new Date().toISOString(),
    },
  });
}

/**
 * Example: Log account deletion (GDPR right to be forgotten)
 */
export async function logAccountDeletion(
  user: any,
  req: NextApiRequest
) {
  await audit.logCompliance({
    eventType: AuditEventType.DATA_DELETION,
    userId: user.id,
    userEmail: user.email,
    description: "User account deleted (right to be forgotten)",
    complianceFlags: ["GDPR", "RIGHT_TO_BE_FORGOTTEN"],
    req,
    metadata: {
      deletedAt: new Date().toISOString(),
      dataRetentionPeriod: "30 days",
    },
  });
}

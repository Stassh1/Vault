/**
 * Azure Purview Integration for Papermark
 *
 * Provides comprehensive audit logging, data governance, and compliance tracking.
 *
 * Usage:
 * ```typescript
 * import { audit, AuditEventType } from '@/lib/purview';
 *
 * // Log a document view
 * await audit.logDocument({
 *   eventType: AuditEventType.DOCUMENT_VIEWED,
 *   documentId: doc.id,
 *   documentName: doc.name,
 *   userId: user.id,
 *   userEmail: user.email,
 *   req
 * });
 * ```
 */

export { getAuditService } from "./audit";
export { getPurviewClient } from "./client";
export * from "./types";

// Convenient singleton export
import { getAuditService } from "./audit";
export const audit = getAuditService();

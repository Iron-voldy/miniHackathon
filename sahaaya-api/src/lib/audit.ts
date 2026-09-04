import { AuditEvent, AuditOutcome } from "../models/AuditEvent";

/**
 * Fire-and-forget audit write. Never blocks or fails the request it's logging for,
 * and never persists raw phrase text or credentials (invariant #11).
 */
export function auditLog(params: {
  route: string;
  actorId?: string;
  requestId?: string;
  outcome: AuditOutcome;
}): void {
  AuditEvent.create({
    route: params.route,
    actorId: params.actorId,
    requestId: params.requestId,
    outcome: params.outcome,
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("audit_log_failed", { route: params.route, error });
  });
}

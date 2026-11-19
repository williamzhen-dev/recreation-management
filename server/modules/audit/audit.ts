import type { DbOrTx } from '../../db/client'
import type { ActorType } from '../../db/schema'
import { auditLog } from '../../db/schema'

export interface Actor {
  type: ActorType
  userId: string | null
}

export const SYSTEM_ACTOR: Actor = { type: 'system', userId: null }

export interface AuditEntry {
  organizationId?: string | null
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

export async function recordAudit(tx: DbOrTx, actor: Actor, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    organizationId: entry.organizationId ?? null,
    actorType: actor.type,
    actorUserId: actor.userId,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? {},
  })
}

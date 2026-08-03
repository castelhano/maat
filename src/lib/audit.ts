import { prisma } from "@/lib/prisma";

export async function logAction(
  actorId: string,
  action: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      targetId,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    },
  });
}

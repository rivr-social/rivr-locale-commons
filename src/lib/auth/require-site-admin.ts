import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { agents } from "@/db/schema";

export const ADMIN_AUTH_ERROR_UNAUTHORIZED = "Unauthorized";
export const ADMIN_AUTH_ERROR_FORBIDDEN = "Forbidden: admin privileges required";

export async function requireSiteAdmin(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  if (!userId) throw new Error(ADMIN_AUTH_ERROR_UNAUTHORIZED);

  const [agent] = await db
    .select({ metadata: agents.metadata })
    .from(agents)
    .where(eq(agents.id, userId))
    .limit(1);

  if (!agent) throw new Error(ADMIN_AUTH_ERROR_UNAUTHORIZED);

  const metadata =
    agent.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata)
      ? (agent.metadata as Record<string, unknown>)
      : {};

  if (metadata.siteRole !== "admin") {
    throw new Error(ADMIN_AUTH_ERROR_FORBIDDEN);
  }

  return userId;
}

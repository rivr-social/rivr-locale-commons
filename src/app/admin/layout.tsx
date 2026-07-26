import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminShell } from "./admin-shell";
import {
  ADMIN_AUTH_ERROR_UNAUTHORIZED,
  requireSiteAdmin,
} from "@/lib/auth/require-site-admin";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await requireSiteAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === ADMIN_AUTH_ERROR_UNAUTHORIZED) {
      redirect("/login?callbackUrl=/admin");
    }
    redirect("/");
  }

  return <AdminShell>{children}</AdminShell>;
}

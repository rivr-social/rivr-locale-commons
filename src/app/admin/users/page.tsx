/**
 * Locale admin user management page for `/admin/users`.
 *
 * Lists all locale users with search, status toggling (active/inactive),
 * and links to profile and badge management.
 *
 * Rendering: Server Component wrapping client `AdminUsersClient`.
 */
import { fetchAdminUsers } from "@/app/actions/admin"
import { AdminUsersClient } from "./admin-users-client"

export default async function AdminUsersPage() {
  const users = await fetchAdminUsers()
  return <AdminUsersClient initialUsers={users} />
}

/**
 * Locale admin badge management page for `/admin/badges`.
 *
 * Allows locale admins to assign/remove badges from users, view all available badges,
 * and create new badge definitions scoped to this locale instance.
 *
 * Rendering: Server Component (fetches data) wrapping a client component.
 */
import { getBadgeDefinitions, getUserBadgeIds } from "@/lib/queries/resources"
import { fetchAdminUsers } from "@/app/actions/admin"
import { AdminBadgesClient } from "./admin-badges-client"

export default async function AdminBadgesPage() {
  const [allBadges, adminUsers] = await Promise.all([
    getBadgeDefinitions(),
    fetchAdminUsers(),
  ])

  const badgeUsers = adminUsers
    .filter((u) => u.status === "active")
    .slice(0, 50)
    .map((u) => ({
      id: u.id,
      name: u.name,
      image: u.image,
      type: u.type,
    }))

  const userBadgeEntries = await Promise.all(
    badgeUsers.map(async (user) => {
      const badgeIds = await getUserBadgeIds(user.id)
      return [user.id, badgeIds] as const
    })
  )
  const userBadgeMap = Object.fromEntries(userBadgeEntries)

  return (
    <AdminBadgesClient
      allBadges={allBadges}
      userBadgeMap={userBadgeMap}
      users={badgeUsers}
    />
  )
}

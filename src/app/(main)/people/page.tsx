"use client"
import { useState } from "react"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { usePeople } from "@/lib/hooks/use-graph-data"
import Link from "next/link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

/**
 * People directory page for browsing user profiles.
 *
 * Route: `/people` (App Router page segment).
 * Data requirements: reads `people` and load `state` via `usePeople()` to render loading
 * and populated profile list states.
 *
 * Rendering: client-rendered (`"use client"`) because it depends on stateful hooks.
 * Metadata: no `metadata` export is present in this file.
 * Auth/redirects: no auth guard or redirect is executed in this component.
 */
/**
 * Renders the People listing UI with chapter selector and profile links.
 *
 * @returns The People page content.
 */
export default function PeoplePage() {
  const [selectedChapter, setSelectedChapter] = useState("boulder")
  // Client-side people query used for loading and list rendering states.
  const { people: users, state } = usePeople()
  // Show loading UI only before initial results are present.
  const isLoading = state === "loading" && users.length === 0

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6">
      <div className="flex justify-center mb-4">
        <LocaleSwitcher onLocaleChange={setSelectedChapter} selectedLocale={selectedChapter} />
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex-1 flex justify-center">
          <div className="border-b-2 border-primary px-4 py-2">
            <span className="text-primary font-medium">People</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Conditional rendering: loading placeholder until initial people payload resolves. */}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading people...</p>
        ) : (
          // Conditional rendering: when loaded, map each person to a profile link card.
          users.map((user) => (
            <Link href={`/profile/${user.username || user.id}`} key={user.id} className="flex items-center gap-4 py-2">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name} />
                <AvatarFallback>{user.name.substring(0, 2)}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium">{user.name}</h3>
                <p className="text-sm text-gray-500">{user.location || "Boulder, CO"}</p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

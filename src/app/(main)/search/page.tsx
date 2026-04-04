"use client"

/**
 * Locale-scoped search results page for cross-entity discovery.
 *
 * Route: `/search` with expected query params:
 * - `q`: search term used by feed modules and local people filtering.
 * - `chapter`: optional locale scope (defaults to `"all"`).
 *
 * Adapted from global search page for locale scope. Provides tabbed search
 * results for posts, events, groups, and people within this locale instance.
 *
 * Data requirements:
 * - Client-side people list from `usePeople()` for `PeopleFeed` and member hydration.
 * - Child feed components (`PostFeed`, `EventFeed`, `GroupFeed`) fetch their own data.
 */
import { useState, useMemo, useTransition } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResponsiveTabsList } from "@/components/responsive-tabs-list"
import { SearchHeader } from "@/components/search-header"
import { PostFeed } from "@/components/post-feed"
import { EventFeed } from "@/components/event-feed"
import { GroupFeed } from "@/components/group-feed"
import { PeopleFeed } from "@/components/people-feed"
import { usePeople } from "@/lib/hooks/use-graph-data"
import { toggleJoinGroup } from "@/app/actions/interactions"
import type { User } from "@/lib/types"

/**
 * Renders tabbed search results for posts, events, groups, and people
 * scoped to this locale instance.
 */
export default function LocaleSearchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const query = searchParams.get("q") || ""
  const [selectedChapter, setSelectedChapter] = useState(searchParams.get("chapter") || "all")
  const { people: users } = usePeople()
  const [, startTransition] = useTransition()

  const filteredPeople = useMemo(() => {
    if (query) {
      return users.filter(
        (user) =>
          user.name.toLowerCase().includes(query.toLowerCase()) ||
          (user.username || "").toLowerCase().includes(query.toLowerCase()) ||
          (user.bio && user.bio.toLowerCase().includes(query.toLowerCase())),
      )
    }
    return []
  }, [query, users])

  /**
   * Updates the selected locale scope and synchronizes it to the URL.
   */
  const handleChapterChange = (chapterId: string) => {
    setSelectedChapter(chapterId)
    const params = new URLSearchParams(searchParams.toString())
    params.set("chapter", chapterId)
    router.replace(`/search?${params.toString()}`)
  }

  /**
   * Resolves group member IDs into user objects for `GroupFeed`.
   */
  const getMembers = (memberIds: string[]): User[] => {
    return memberIds.map((id) => {
      const user = users.find((u) => u.id === id)
      return user || { id, name: "Unknown User", username: "unknown", avatar: "", followers: 0, following: 0 } as User
    })
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="container mx-auto px-4 py-6 flex-1 pb-16">
        <SearchHeader selectedChapter={selectedChapter} onChapterChange={handleChapterChange} />
        {query && (
          <h1 className="text-2xl font-bold mt-4 mb-2">Search Results for &quot;{query}&quot;</h1>
        )}
        {selectedChapter !== "all" && (
          <p className="text-muted-foreground mb-4">Filtered by locale: {selectedChapter}</p>
        )}

        <Tabs defaultValue="posts" className="mt-6">
          <ResponsiveTabsList>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="people">People</TabsTrigger>
          </ResponsiveTabsList>
          <TabsContent value="posts" className="mt-4">
            <PostFeed query={query} chapterId={selectedChapter} />
          </TabsContent>
          <TabsContent value="events" className="mt-4">
            <EventFeed query={query} chapterId={selectedChapter} />
          </TabsContent>
          <TabsContent value="groups" className="mt-4">
            <GroupFeed
              query={query}
              chapterId={selectedChapter}
              getMembers={getMembers}
              onJoinGroup={(groupId) => {
                startTransition(async () => {
                  await toggleJoinGroup(groupId, "group")
                })
              }}
            />
          </TabsContent>
          <TabsContent value="people" className="mt-4">
            <PeopleFeed people={filteredPeople} query={query} chapterId={selectedChapter} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

"use client"

/**
 * Marketplace index page for the locale instance.
 *
 * Route: `/marketplace`
 *
 * Displays all marketplace listings scoped to this locale using the
 * `useMarketplace` hook and the shared `MarketplaceFeed` component.
 * Users can filter by listing type, save/contact/share listings,
 * and navigate to individual listing detail pages.
 *
 * Data requirements:
 * - `useMarketplace()` for locale-scoped listings.
 * - `usePeople()` for seller display data resolution.
 * - `toggleSaveListing` server action for save/unsave.
 *
 * Rendering model:
 * - Client Component due to interactive filter state and client hooks.
 */

import { useCallback, useMemo, useState } from "react"
import { ShoppingBag, ExternalLink } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { MarketplaceFeed } from "@/components/marketplace-feed"
import { useMarketplace, usePeople } from "@/lib/hooks/use-graph-data"
import { toggleSaveListing } from "@/app/actions/interactions"
import { getGlobalUrl } from "@/lib/federation/global-url"
import type { User } from "@/lib/types"

/** Fallback seller object returned when no matching person is found. */
const UNKNOWN_SELLER = {
  id: "",
  name: "Unknown Seller",
  username: "",
  avatar: "",
} as const

/**
 * Locale-scoped marketplace index page with listing feed, save/contact/share
 * actions, and a link to the global marketplace.
 */
export default function MarketplacePage() {
  const { listings, state } = useMarketplace()
  const { people } = usePeople()
  const { toast } = useToast()

  const [savedListings, setSavedListings] = useState<string[]>([])

  const globalMarketplaceUrl = getGlobalUrl("/marketplace")

  /** Build a lookup map from people for fast seller resolution. */
  const peopleById = useMemo(() => {
    const map = new Map<string, User>()
    for (const person of people) {
      map.set(person.id, person)
    }
    return map
  }, [people])

  /**
   * Resolves seller display data from the people list or the listing's
   * embedded seller object, falling back to UNKNOWN_SELLER.
   */
  const getSeller = useCallback(
    (sellerId: string) => {
      const person = peopleById.get(sellerId)
      if (person) {
        return {
          id: person.id,
          name: person.name,
          username: person.username,
          avatar: person.avatar,
        }
      }
      // Try to find seller info from the listing's embedded seller object
      const listing = listings.find((l) => l.seller?.id === sellerId)
      if (listing?.seller) {
        return {
          id: listing.seller.id,
          name: listing.seller.name || UNKNOWN_SELLER.name,
          username: listing.seller.username || UNKNOWN_SELLER.username,
          avatar: listing.seller.avatar || UNKNOWN_SELLER.avatar,
        }
      }
      return { ...UNKNOWN_SELLER, id: sellerId }
    },
    [peopleById, listings],
  )

  /** Toggles save state for a listing via server action. */
  const handleSave = useCallback(
    async (listingId: string) => {
      const result = await toggleSaveListing(listingId)
      if (result.success) {
        setSavedListings((prev) =>
          prev.includes(listingId)
            ? prev.filter((id) => id !== listingId)
            : [...prev, listingId],
        )
      } else {
        toast({
          title: "Could not save listing",
          description: result.message ?? "Please try again.",
          variant: "destructive",
        })
      }
    },
    [toast],
  )

  /** Opens a placeholder contact flow (toast for now). */
  const handleContact = useCallback(
    (listingId: string) => {
      toast({
        title: "Contact seller",
        description: "Messaging is coming soon.",
      })
    },
    [toast],
  )

  /** Copies the listing URL to the clipboard via the Web Share API or fallback. */
  const handleShare = useCallback(
    async (listingId: string) => {
      const url = `${window.location.origin}/marketplace/${listingId}`
      if (navigator.share) {
        try {
          await navigator.share({ title: "Check out this listing", url })
        } catch {
          /* User cancelled share dialog */
        }
      } else {
        await navigator.clipboard.writeText(url)
        toast({ title: "Link copied to clipboard" })
      }
    },
    [toast],
  )

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Marketplace</h1>
            <p className="text-sm text-muted-foreground">
              Products, services, and offerings in this locale
            </p>
          </div>
        </div>

        <a
          href={globalMarketplaceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Global Marketplace
        </a>
      </div>

      {/* Feed content */}
      {state === "loading" && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse flex flex-col items-center gap-2">
            <div className="h-8 w-8 bg-gray-300 dark:bg-zinc-700 rounded-full" />
            <div className="h-4 w-32 bg-gray-300 dark:bg-zinc-700 rounded" />
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="text-center py-20">
          <p className="text-muted-foreground">
            Could not load marketplace listings. Please try again later.
          </p>
        </div>
      )}

      {(state === "loaded" || state === "idle") && (
        <MarketplaceFeed
          listings={listings}
          getSeller={getSeller}
          onSave={handleSave}
          onContact={handleContact}
          onShare={handleShare}
          savedListings={savedListings}
        />
      )}

      {/* Item count */}
      {state === "loaded" && (
        <div className="text-xs text-muted-foreground text-center pb-4">
          {listings.length} listing{listings.length !== 1 ? "s" : ""} in this locale
        </div>
      )}
    </div>
  )
}

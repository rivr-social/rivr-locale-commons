# rivr-locale-commons — Agent Notes

This app is a **locale/commons aggregator** for a bioregion. Unlike the
single-tenant person app, it **renders every entity class locally**: groups
(incl. rings & families, all at `/groups/[id]`), projects (`/projects/[id]`),
and person profiles (`/profile/[username]`).

## Canonical entity links (federated-projection routing, 2026-07-14)

Fixes two link bugs at once:

1. A link to a **remote-homed** entity (a federated projection — e.g. Cameron's
   "Spirit of the Front Range" membership aggregated here) routed to a LOCAL
   path and 404'd, because its sovereign home is on another instance.
2. A **ring/family** link emitted a bare `/rings/<id>` or `/families/<id>` path
   that 404s — this app has **no** `/rings` or `/families` route; rings and
   families are group-type agents that render AS groups at `/groups/[id]`
   (`src/app/groups/[id]/page.tsx` includes ring/family in its group-type set).

- **`src/lib/federation/entity-link.ts`** — the pure, client-safe resolver.
  `resolveRemoteHomeBaseUrl(metadata)` reads the home stamp
  (`homeBaseUrl` → `federatedHomeBaseUrl` → origin of `canonicalUrl`);
  `resolveEntityHref(metadata, localPath, {selfBaseUrl, globalFallback})` returns
  `{href, isRemote}` — a remote projection → absolute URL on its sovereign home;
  a locally-homed entity → the local path. A self-host stamp is treated as local
  (loop guard). **This app renders every class locally, so callers pass
  `globalFallback: false`** (the `globalFallback: true` mode is retained for a
  hypothetical class with no local page, and is exercised by the unit tests).
  Tests: `src/lib/federation/__tests__/entity-link.test.ts` — run with
  `npx vitest run src/lib/federation/__tests__/entity-link.test.ts` under
  **Node ≥22** (vitest/rolldown needs `node:util.styleText`).
- **`src/components/canonical-link.tsx`** — `CanonicalLink` renders an absolute
  href as a plain `<a target="_blank" rel="noopener noreferrer">` (NEVER a Next
  `<Link>` — cross-origin RSC prefetch is the CSP-flash class) and a local path
  as `<Link>`. `navigateToHref(router, href)` is the imperative analog
  (`window.location.assign` for cross-origin, `router.push` for local).
- **Stamps (in `graph-adapters.ts`):** `agentToGroup`/`agentToRing`/
  `agentToFamily`/`agentToProject` stamp `homeHref`; `agentToUser` stamps
  `profileHref`. All resolve to a **local** path when locally homed (rings &
  families → `/groups/<id>`), or the sovereign-home URL for a federated
  projection. `resourceToMarketplaceListing` stamps `ownerPath` the same way.
  Consumers render `obj.homeHref ?? /groups/<id>` (or `/projects`),
  `obj.profileHref ?? /profile/<u>`, `listing.ownerPath ?? …` through
  `CanonicalLink`.
- **`fetchGroupLineage`** (`src/app/actions/graph/groups.ts`) stamps `homeHref`
  on each ancestor via `resolveEntityHref` (it already fetches the parent's full
  metadata); `GroupProfileHeader` renders the breadcrumb through `CanonicalLink`.

### Swept surfaces

Group/ring/family/project cards: `ring-feed`, `family-feed`, `project-feed`,
`group-feed`, `profile-group-feed`, `group-subgroups`, `group-affiliates`,
`group-relationships`, `group-relationship-manager`, `group-profile-header`
(lineage). People/member: `people-feed`, `user-connections`, `post-feed`
(author/creator via `profileHref`, organizer/group via `homeHref`, card-click
via `navigateToHref`), `post-detail-client` (author), `agent-graph` (subgroup
node via `homeHref`; `map-card` renders `item.url` through `CanonicalLink`),
`app/(main)/profile/profile-client.tsx` (`getActivityObjectHref` resolves via
`resolveEntityHref`; rings/families → `/groups/<id>`),
`app/(main)/people/page.tsx`, `app/(main)/groups/page.tsx`,
`app/(main)/projects/[id]/page.tsx` (lead + members),
`app/events/[id]/page.tsx` (organizer/creator). Marketplace owner links:
`marketplace-feed`, `group-marketplace-feed`, `marketplace-item-page-client`,
`marketplace/[id]/purchase` + `/confirmed`. Search (imperative nav via
`navigateToHref`): `search-bar`, `search-header`.

### Not the 404 class (left as local paths — routes exist here)

`notifications` (join/follow/attend links resolve from bare notification IDs to
local paths that render fine here; no home stamp on the record to reach a
federated home). Posts/events/jobs render locally.

### Follow-up gaps (need a home stamp plumbed into the data layer; no metadata in scope today)

These already emit a working **local** path (no 404 here), but can't route a
federated projection to its sovereign home until their fetchers project the
entity's home stamp:

- `comment-feed` — bare `comment.authorId`.
- `receipt-card` / `marketplace/[id]/receipt/[receiptId]/receipt-detail-client`
  — inline `seller` shape with no home stamp.
- `event-detail-tabs` — `EventAttendee` list has no home stamp.
- `event-card` / `calendar-event` — bare `groupId`/`projectId` props.
- `badges/[id]/badge-detail` — bare `job.groupId`.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getInstanceConfig } from "@/lib/federation/instance-config";
import { resolveHomeInstance, resolveLocalActorId } from "@/lib/federation/resolution";
import {
  authorizeFederationRequest,
  bindAuthorizedFederationActor,
} from "@/lib/federation-auth";
import { runWithFederationExecutionContext } from "@/lib/federation/execution-context";
import {
  REMOTE_VIEWER_COOKIE_NAME,
  decodeRemoteViewerSession,
} from "@/lib/federation/remote-viewer-session";
import {
  resolveVisitorScope,
  requiredVisitorCapability,
  visitorCan,
} from "@/lib/federation/visitor-scope";
import { toggleFollowAgent, toggleJoinGroup } from "@/app/actions/interactions/social";
import {
  toggleLikeOnTarget,
  setReactionOnTarget,
  toggleThankOnTarget,
} from "@/app/actions/interactions/reactions";
import { createBookingAction } from "@/app/actions/interactions/bookings";
import { sendThanksTokenAction } from "@/app/actions/interactions/thanks-tokens";
import { setEventRsvp, applyToJob } from "@/app/actions/interactions/events-jobs";
import { createMutualAssetAction, bookAssetAction } from "@/app/actions/interactions/assets";
import {
  sendVoucherAction,
  createVoucherAction,
  claimVoucherAction,
  redeemVoucherAction,
} from "@/app/actions/interactions/vouchers";
import { postCommentAction } from "@/app/actions/resource-creation/comments";
import { createPostResource } from "@/app/actions/resource-creation/posts";
import { updateResource, deleteResource } from "@/app/actions/resource-creation/lifecycle";
import type { UpdateResourceInput } from "@/app/actions/resource-creation/types";
import {
  syncEventTicketOfferings,
  createEventResource,
} from "@/app/actions/resource-creation/events";
import {
  purchaseWithWalletAction,
  purchaseEventTicketsWithWalletAction,
  createProvidePaymentAction,
} from "@/app/actions/wallet/purchases";
import {
  challengeGroupAccess,
  revokeGroupMembership,
  renewGroupMembership,
  requestGroupMembership,
  reviewGroupJoinRequest,
} from "@/app/actions/group-access";
import { isGroupMember } from "@/lib/permissions";
import {
  setGroupPassword,
  removeGroupPassword,
  updateGroupJoinSettings,
  updateGroupMembershipPlans,
} from "@/app/actions/group-admin";
import {
  AUTHORITY_GUARD_REASONS,
  checkAuthorityForActor,
} from "@/lib/federation/authority-guard";

const KNOWN_MUTATION_TYPES = [
  "toggleFollowAgent",
  "toggleJoinGroup",
  "toggleLikeOnTarget",
  "setReactionOnTarget",
  "toggleThankOnTarget",
  "createBookingAction",
  "sendThanksTokenAction",
  "setEventRsvp",
  "applyToJob",
  "createMutualAssetAction",
  "bookAssetAction",
  "purchaseWithWalletAction",
  "purchaseEventTicketsWithWalletAction",
  "createProvidePaymentAction",
  "sendVoucherAction",
  "createVoucherAction",
  "claimVoucherAction",
  "redeemVoucherAction",
  "postCommentAction",
  "createPostResource",
  "createEventResource",
  "updateResource",
  "deleteResource",
  "syncEventTicketOfferings",
  "challengeGroupAccess",
  "revokeGroupMembership",
  "renewGroupMembership",
  "requestGroupMembership",
  "reviewGroupJoinRequest",
  "setGroupPassword",
  "removeGroupPassword",
  "updateGroupJoinSettings",
  "updateGroupMembershipPlans",
] as const;

type MutationRequestBody = {
  type?: string;
  actorId?: string;
  targetAgentId?: string;
  payload?: unknown;
  /**
   * Buyer rail (open-issues P0) — home-signed actor-identity assertion. Present
   * when the forwarder is the actor's home and vouches for a cross-instance
   * actor this receiver has no `federation_entity_map` binding for yet. Verified
   * against the authenticated peer's registered key, then used to materialize +
   * bind the actor. Additive; absence keeps the strict rejection unchanged.
   */
  actorAssertion?: unknown;
};

export async function POST(request: Request) {
  const config = getInstanceConfig();

  try {
    // Decode the remote-viewer cookie up front so a cookie-only federated
    // visitor (cross-instance SSO landing, no peer credentials) can authenticate
    // as their own actor. The cookie is HMAC-signed with this instance's
    // AUTH_SECRET, so it is unforgeable and instance-bound. Peer/admin/session
    // auth remains the path for everything else.
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
    const cookieStore = await cookies();
    const rawViewerCookie = cookieStore.get(REMOTE_VIEWER_COOKIE_NAME)?.value ?? undefined;
    const remoteViewerSession = decodeRemoteViewerSession(rawViewerCookie, secret);

    const authorization = remoteViewerSession
      ? { authorized: true as const, actorId: remoteViewerSession.actorId }
      : await authorizeFederationRequest(request);
    if (!authorization.authorized) {
      return NextResponse.json(
        { success: false, error: authorization.reason ?? "Authentication required" },
        { status: 401 },
      );
    }

    const remoteInstanceId = request.headers.get("X-Instance-Id");
    const remoteInstanceSlug = request.headers.get("X-Instance-Slug");

    if (!remoteInstanceId || !remoteInstanceSlug) {
      return NextResponse.json(
        { success: false, error: "Missing required headers: X-Instance-Id, X-Instance-Slug" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as MutationRequestBody;
    const { type, actorId, targetAgentId, payload } = body;

    if (!type || !actorId || !targetAgentId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: type, actorId, targetAgentId" },
        { status: 400 },
      );
    }

    let actorBinding = await bindAuthorizedFederationActor(authorization, actorId);

    // Buyer rail (open-issues P0): when a peer-authenticated forward names an
    // actor we have no binding for, but carries a valid home-signed actor
    // assertion, verify it against the peer's registered key and materialize +
    // bind the actor via the existing projection rail, THEN re-bind. Absent or
    // invalid assertion → the strict F1 rejection below is preserved unchanged.
    // Guarded to peer-secret auth (cookie visitors carry no peerNodeId).
    if (
      (!actorBinding.authorized || !actorBinding.actorId) &&
      authorization.peerNodeId &&
      body.actorAssertion &&
      actorId
    ) {
      const { resolveOwnerRoutedActor } = await import(
        "@/lib/federation/owner-routed-actor"
      );
      const materialized = await resolveOwnerRoutedActor({
        peerNodeId: authorization.peerNodeId,
        audienceBaseUrl: config.baseUrl,
        requestedActorId: actorId,
        assertion: body.actorAssertion,
      });
      if (materialized.ok) {
        actorBinding = await bindAuthorizedFederationActor(authorization, actorId);
      } else {
        console.warn(
          `[federation/mutations] owner-routed actor assertion rejected from ${remoteInstanceSlug}: ${materialized.reason}`,
        );
      }
    }

    if (!actorBinding.authorized || !actorBinding.actorId) {
      return NextResponse.json(
        { success: false, error: actorBinding.reason ?? "Actor authorization failed" },
        { status: 403 },
      );
    }

    // Cookie-visitor capability gate:
    // If this request arrives without peer auth (i.e., it is being driven by a
    // browser-side cookie visitor rather than a trusted peer), check whether
    // the visitor's scope covers the requested mutation type. Peer-authorized
    // and owner requests bypass this check entirely.
    const isCookieVisitor =
      !!remoteViewerSession &&
      (!config.primaryAgentId || remoteViewerSession.actorId !== config.primaryAgentId);

    if (isCookieVisitor) {
      const required = requiredVisitorCapability(type);
      const scope = await resolveVisitorScope();
      if (required === null || !visitorCan(scope, required)) {
        return NextResponse.json(
          {
            success: false,
            accepted: false,
            error: `Visitor scope does not grant '${required ?? type}' on this instance.`,
            errorCode: "VISITOR_CAPABILITY_DENIED",
          },
          { status: 403 },
        );
      }
    }

    // Peer-side authority enforcement:
    // Mutations are sensitive operations. If the actor's home has been revoked
    // (or superseded by a successor claim), reject before dispatching. This
    // path does not carry an asserted homeBaseUrl, so we rely on the lower-
    // information `checkAuthorityForActor` variant which looks up the latest
    // authority events by actorId and always re-reads the DB (no TTL cache).
    const authorityCheck = await checkAuthorityForActor(actorId);
    if (!authorityCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error:
            authorityCheck.reason === AUTHORITY_GUARD_REASONS.SUPERSEDED_BY_SUCCESSOR
              ? "Actor home has been superseded by a successor authority claim"
              : "Actor home has been revoked",
          errorCode:
            authorityCheck.reason === AUTHORITY_GUARD_REASONS.SUPERSEDED_BY_SUCCESSOR
              ? "HOME_AUTHORITY_SUPERSEDED"
              : "HOME_AUTHORITY_REVOKED",
          ...(authorityCheck.newHomeBaseUrl
            ? { newHomeBaseUrl: authorityCheck.newHomeBaseUrl }
            : {}),
        },
        { status: 403 },
      );
    }

    // Normalize the TARGET through the entity map before the locality gate -
    // identity-normalized agents carry DIFFERENT ids per instance; the raw
    // forwarded id can be unknown here and would 421 as "not local" even
    // though the target IS this instance's own agent. Read-only; unmapped ids
    // pass through unchanged.
    const localTargetAgentId = await resolveLocalActorId(targetAgentId);

    const homeInstance = await resolveHomeInstance(localTargetAgentId);
    if (!homeInstance.isLocal) {
      return NextResponse.json(
        {
          success: false,
          error: `Agent ${targetAgentId} is not local to this instance. Home instance: ${homeInstance.slug} (${homeInstance.nodeId})`,
        },
        { status: 421 },
      );
    }

    console.log(
      `[federation/mutations] Executing mutation from ${remoteInstanceSlug} (${remoteInstanceId}):`,
      {
        type,
        actorId: actorBinding.actorId,
        targetAgentId,
        payloadKeys: payload && typeof payload === "object" ? Object.keys(payload as object) : [],
      },
    );

    const isKnownType = (KNOWN_MUTATION_TYPES as readonly string[]).includes(type);

    // Honesty contract (rivr-group#9): mutation types without a real dispatch
    // path must NOT claim acceptance. Returning a non-2xx with accepted:false
    // lets the forwarding instance surface a real error to the acting user
    // instead of silently dropping their write.
    if (!isKnownType) {
      return NextResponse.json(
        {
          success: false,
          accepted: false,
          instanceId: config.instanceId,
          knownType: false,
          errorCode: "UNKNOWN_MUTATION_TYPE",
          error: `Mutation type '${type}' is not in the known dispatch map.`,
        },
        { status: 400 },
      );
    }

    // The bound actor id is ALREADY this instance's local agent id:
    // bindAuthorizedFederationActor resolves the peer-supplied actor through
    // federation_entity_map (strict, read-only) and returns the receiver-local
    // id, so downstream authority checks (e.g. hasGroupWriteAccess for
    // post-as-group) run against THIS instance's own graph.
    const effectiveActorId = actorBinding.actorId;

    const result = (await dispatchLegacyMutation(
      type,
      effectiveActorId,
      targetAgentId,
      payload,
    )) as { success?: boolean; accepted?: boolean; error?: string; [key: string]: unknown };

    // Defensive 501 path: a type listed in KNOWN_MUTATION_TYPES but missing
    // from the dispatch switch must not claim success either.
    if (result?.accepted === false) {
      return NextResponse.json(
        {
          success: false,
          accepted: false,
          instanceId: config.instanceId,
          knownType: true,
          errorCode: "MUTATION_NOT_IMPLEMENTED",
          error:
            result.error ??
            `Mutation type '${type}' is recognized but not yet implemented on this instance.`,
        },
        { status: 501 },
      );
    }

    return NextResponse.json({
      success: result?.success ?? true,
      data: result,
      knownType: true,
      instanceId: config.instanceId,
    });
  } catch (error) {
    console.error("[federation/mutations] Error processing mutation:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process mutation",
      },
      { status: 500 },
    );
  }
}

async function dispatchLegacyMutation(
  type: string,
  actorId: string,
  targetAgentId: string,
  payload: unknown,
): Promise<unknown> {
  const record = asRecord(payload);

  return runWithFederationExecutionContext(actorId, async () => {
    switch (type) {
      case "toggleFollowAgent":
        return toggleFollowAgent(targetAgentId);
      case "toggleJoinGroup": {
        const joinType = record.type === "ring" ? "ring" : "group";
        // Groups honor the approval queue: a non-member's join routes through
        // the approval-aware requestGroupMembership (which files a pending
        // request for approval-required groups) instead of an instant toggle
        // join. Existing members (leave toggle) and rings keep the direct
        // toggle. Closes the federation back-door past the approval gate.
        if (joinType === "group") {
          const membership = await isGroupMember(actorId, targetAgentId);
          if (!membership.isMember) {
            return requestGroupMembership(
              targetAgentId,
              (record.options as Parameters<typeof requestGroupMembership>[1]) ?? undefined,
            );
          }
        }
        return toggleJoinGroup(targetAgentId, joinType);
      }
      case "toggleLikeOnTarget":
        return toggleLikeOnTarget(
          readString(record, "targetId", targetAgentId),
          readTargetType(record, "targetType"),
        );
      case "setReactionOnTarget":
        return setReactionOnTarget(
          readString(record, "targetId", targetAgentId),
          readTargetType(record, "targetType"),
          readReactionType(record, "reactionType") as Parameters<typeof setReactionOnTarget>[2],
        );
      case "toggleThankOnTarget":
        return toggleThankOnTarget(
          readString(record, "targetId", targetAgentId),
          readTargetType(record, "targetType"),
        );
      case "createBookingAction":
        return createBookingAction({
          offeringId: requireString(record, "offeringId"),
          slotDate: requireString(record, "slotDate"),
          slotTime: requireString(record, "slotTime"),
          notes: optionalString(record, "notes"),
        });
      case "sendThanksTokenAction":
        return sendThanksTokenAction(
          requireString(record, "tokenId"),
          readString(record, "recipientId", targetAgentId),
          optionalString(record, "message"),
          optionalString(record, "contextId"),
        );
      case "setEventRsvp":
        return setEventRsvp(
          requireString(record, "eventId"),
          readRsvpStatus(record, "status"),
        );
      case "applyToJob":
        return applyToJob(requireString(record, "jobId"));
      case "createMutualAssetAction":
        return createMutualAssetAction(record as Parameters<typeof createMutualAssetAction>[0]);
      case "bookAssetAction":
        return bookAssetAction(record as Parameters<typeof bookAssetAction>[0]);
      // Buyer rail (open-issues P0): in-app wallet purchases + provide-payment.
      // The actor was already bound to this instance's local id (strict
      // entity-map lookup or the materialize-then-bind assertion fallback) and
      // the switch runs in runWithFederationExecutionContext, so each action's
      // own getCurrentUserIdForWrite resolves the federated buyer as a local
      // session and its balance/authority checks run against THIS graph.
      case "purchaseWithWalletAction":
        return purchaseWithWalletAction(
          requireString(record, "listingId"),
          requireNumber(record, "subtotalCents"),
          optionalString(record, "dealPostId"),
          optionalString(record, "bookingDate"),
          optionalString(record, "bookingSlot"),
        );
      case "purchaseEventTicketsWithWalletAction":
        return purchaseEventTicketsWithWalletAction(
          requireString(record, "eventId"),
          requireArray(record, "selections") as Parameters<
            typeof purchaseEventTicketsWithWalletAction
          >[1],
        );
      case "createProvidePaymentAction":
        return createProvidePaymentAction(requireString(record, "offeringId"));
      case "sendVoucherAction":
        return sendVoucherAction(
          requireString(record, "voucherId"),
          readString(record, "recipientId", targetAgentId),
          optionalString(record, "message"),
          optionalString(record, "contextId"),
        );
      case "createVoucherAction":
        return createVoucherAction(record as Parameters<typeof createVoucherAction>[0]);
      case "claimVoucherAction":
        return claimVoucherAction(requireString(record, "voucherId"));
      case "redeemVoucherAction":
        return redeemVoucherAction(requireString(record, "voucherId"));
      case "postCommentAction":
        return postCommentAction(
          requireString(record, "resourceId"),
          requireString(record, "content"),
          optionalString(record, "parentCommentId"),
        );
      case "createPostResource":
        return createPostResource(record as Parameters<typeof createPostResource>[0]);
      case "createEventResource":
        return createEventResource(record as Parameters<typeof createEventResource>[0]);
      // Cross-instance resource UPDATE/DELETE by a peer admin. The actor was
      // already bound to this instance's local id by
      // bindAuthorizedFederationActor (strict entity-map lookup, never minted)
      // and the whole switch runs in runWithFederationExecutionContext, so
      // updateResource/deleteResource's own canModifyResource → hasGroupWriteAccess
      // gate authorizes the resolved actor exactly like a local session.
      case "updateResource":
        return updateResource(record as unknown as UpdateResourceInput);
      case "deleteResource":
        return deleteResource(requireString(record, "resourceId"));
      case "syncEventTicketOfferings":
        await syncEventTicketOfferings(record as Parameters<typeof syncEventTicketOfferings>[0]);
        return { success: true };
      case "challengeGroupAccess":
        return challengeGroupAccess(targetAgentId, requireString(record, "password"));
      case "revokeGroupMembership":
        return revokeGroupMembership(targetAgentId, requireString(record, "memberId"));
      case "renewGroupMembership":
        return renewGroupMembership(targetAgentId);
      case "requestGroupMembership":
        return requestGroupMembership(
          targetAgentId,
          (record.options as Parameters<typeof requestGroupMembership>[1]) ?? undefined,
        );
      case "reviewGroupJoinRequest":
        return reviewGroupJoinRequest(
          targetAgentId,
          requireString(record, "requestId"),
          readDecision(record, "decision"),
          optionalString(record, "adminNotes"),
        );
      case "setGroupPassword":
        return setGroupPassword(targetAgentId, requireString(record, "newPassword"));
      case "removeGroupPassword":
        return removeGroupPassword(targetAgentId);
      case "updateGroupJoinSettings":
        return updateGroupJoinSettings(
          targetAgentId,
          record.joinSettings as Parameters<typeof updateGroupJoinSettings>[1],
        );
      case "updateGroupMembershipPlans":
        return updateGroupMembershipPlans(targetAgentId, record.membershipPlans);
      default:
        // Known-but-unwired mutation type: surfaced by POST as a 501 with
        // MUTATION_NOT_IMPLEMENTED (unknown types are rejected with 400
        // before dispatch).
        return {
          success: false,
          accepted: false,
          error: `Mutation type '${type}' is recognized but not yet implemented on this instance.`,
        };
    }
  });
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required payload field: ${key}`);
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireNumber(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Missing or non-numeric payload field: ${key}`);
  }
  return value;
}

function requireArray(payload: Record<string, unknown>, key: string): unknown[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    throw new Error(`Missing or non-array payload field: ${key}`);
  }
  return value;
}

function readString(payload: Record<string, unknown>, key: string, fallback: string): string {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readTargetType(payload: Record<string, unknown>, key: string): "post" | "resource" | "event" {
  const value = payload[key];
  return value === "resource" || value === "event" ? value : "post";
}

function readReactionType(payload: Record<string, unknown>, key: string): "like" | "boost" | "insightful" | "curious" | "celebrate" | "thank" {
  const value = payload[key];
  return value === "boost" ||
    value === "insightful" ||
    value === "curious" ||
    value === "celebrate" ||
    value === "thank"
    ? value
    : "like";
}

function readRsvpStatus(payload: Record<string, unknown>, key: string): "going" | "interested" | "none" {
  const value = payload[key];
  return value === "interested" || value === "none" ? value : "going";
}

function readDecision(payload: Record<string, unknown>, key: string): "approved" | "rejected" {
  return payload[key] === "rejected" ? "rejected" : "approved";
}

import { NextResponse } from "next/server";
import { getInstanceConfig } from "@/lib/federation/instance-config";
import { resolveHomeInstance } from "@/lib/federation/resolution";
import {
  authorizeFederationRequest,
  bindAuthorizedFederationActor,
} from "@/lib/federation-auth";
import { runWithFederationExecutionContext } from "@/lib/federation/execution-context";
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
import {
  syncEventTicketOfferings,
  createEventResource,
} from "@/app/actions/resource-creation/events";
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
  "sendVoucherAction",
  "createVoucherAction",
  "claimVoucherAction",
  "redeemVoucherAction",
  "postCommentAction",
  "createPostResource",
  "createEventResource",
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
};

export async function POST(request: Request) {
  const config = getInstanceConfig();

  try {
    const authorization = await authorizeFederationRequest(request);
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

    const actorBinding = bindAuthorizedFederationActor(authorization, actorId);
    if (!actorBinding.authorized || !actorBinding.actorId) {
      return NextResponse.json(
        { success: false, error: actorBinding.reason ?? "Actor authorization failed" },
        { status: 403 },
      );
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

    const homeInstance = await resolveHomeInstance(targetAgentId);
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

    const result = (await dispatchLegacyMutation(
      type,
      actorBinding.actorId,
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

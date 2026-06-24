import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("@/db", () => ({
  db: { query: { federationEntityMap: { findFirst: (...args: unknown[]) => mockFindFirst(...args) } } },
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn() }));
vi.mock("@/db/schema", () => ({
  federationEntityMap: { originNodeId: "origin_node_id", externalEntityId: "external_entity_id", entityType: "entity_type", localEntityId: "local_entity_id" },
  nodePeers: {},
  nodes: {},
}));

import { resolveLocalActorId } from "@/lib/federation-auth";

const NODE = "44444444-4444-4444-4444-444444444444";
const REMOTE = "aa29fa2d-4c2a-4eaf-a069-b2203a2ce667";
const LOCAL = "ea079076-e7d0-489e-9cb2-1e6275d0d1cf";

describe("resolveLocalActorId", () => {
  beforeEach(() => mockFindFirst.mockReset());
  it("maps a peer-supplied remote actor id to the local agent id when a mapping exists", async () => {
    mockFindFirst.mockResolvedValueOnce({ localEntityId: LOCAL });
    expect(await resolveLocalActorId(NODE, REMOTE)).toBe(LOCAL);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });
  it("returns the original id unchanged when no mapping exists", async () => {
    mockFindFirst.mockResolvedValueOnce(null);
    expect(await resolveLocalActorId(NODE, REMOTE)).toBe(REMOTE);
  });
  it("returns the original id without a DB call when origin node id is absent", async () => {
    expect(await resolveLocalActorId(undefined, REMOTE)).toBe(REMOTE);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });
  it("degrades to the original id if the mapping lookup throws", async () => {
    mockFindFirst.mockRejectedValueOnce(new Error("db down"));
    expect(await resolveLocalActorId(NODE, REMOTE)).toBe(REMOTE);
  });
});

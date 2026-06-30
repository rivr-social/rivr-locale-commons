"use client";

/**
 * Group settings page for `/groups/[id]/settings`.
 *
 * Purpose:
 * - Provides admin-facing controls for membership plans and join settings.
 * - Allows editing and persisting group subscription plans and onboarding requirements.
 *
 * Data requirements:
 * - Client-triggered admin settings fetch (`fetchGroupAdminSettings`) scoped to the group ID.
 * - Client-triggered mutations for join settings and membership plans.
 *
 * Rendering notes:
 * - This is a Client Component (`"use client"`), rendered and hydrated in the browser.
 * - Admin/access checks are enforced by server actions; UI displays an access-denied state on failure.
 * - No `metadata` export is defined in this file.
 */
import { use, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Camera, Loader2, Pencil, Plus, Trash2, UserPlus, CreditCard, MessageSquare, Globe, Mail, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LocationAutocompleteInput, type LocationSuggestion } from "@/components/location-autocomplete-input";
import { TagEditor } from "@/components/tag-editor";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTabsList } from "@/components/responsive-tabs-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { JoinType, type GroupJoinSettings } from "@/lib/types";
import { GroupAdminPassword } from "@/components/group-admin-password";
import { GroupBroadcastCard } from "@/components/group-broadcast-card";
import { GroupJoinRequestsCard } from "@/components/group-join-requests-card";
import { JoinQuestionEditor } from "@/components/join-question-editor";
import {
  fetchGroupAdminSettings,
  updateGroupJoinSettings,
  updateGroupMembershipPlans,
} from "@/app/actions/group-admin";
import { updateGroupResource } from "@/app/actions/create-resources";
import { type GroupMembershipPlan } from "@/lib/group-memberships";
import { useToast } from "@/components/ui/use-toast";
import { getGroupMatrixRoom, setGroupChatMode } from "@/lib/matrix-groups";
import type { ChatMode } from "@/db/schema";
import type { MembershipTier } from "@/db/schema";
import { getSubscriptionStatusAction } from "@/app/actions/billing";
import { SubscriptionGateDialog } from "@/components/subscription-gate-dialog";
import { GroupAdminView } from "@/components/group-admin-view";
import { GroupType as LegacyGroupType } from "@/lib/types";
import type { Group as LegacyGroup } from "@/lib/types";

const RESUME_ORG_UPGRADE_PARAM = "resumeOrgUpgrade";

/** Maximum commission percentage allowed for mart sales. */
const MAX_COMMISSION_PERCENT = 50;

/**
 * Sanitizes a raw price-field keystroke: keeps digits and a single decimal
 * point so the value can be typed freely (e.g. `"12."`, `"12.5"`) without being
 * reformatted on every keystroke. Parsing to cents happens on blur/save.
 *
 * @param raw - The raw input string from the price field.
 * @returns A string containing only digits and at most one `.`.
 */
function sanitizePriceInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

/** Clamps a percentage to the supported `0..MAX_COMMISSION_PERCENT` range. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_COMMISSION_PERCENT, value));
}

/** Settings tab values, in render order. Profile is the default landing tab. */
const SETTINGS_TAB_VALUES = [
  "profile",
  "memberships",
  "join",
  "requests",
  "chat",
  "announcements",
  "map-marker",
  "admin-overview",
] as const;

/**
 * Resolves the active settings tab from the `?tab=` query param. Unknown/absent
 * values fall back to the Profile tab.
 */
function resolveDefaultTab(tabParam: string | null): string {
  return tabParam && (SETTINGS_TAB_VALUES as readonly string[]).includes(tabParam)
    ? tabParam
    : "profile";
}

type EditableMembershipPlan = GroupMembershipPlan;

/**
 * Starter shape for newly created membership plans.
 */
const EMPTY_PLAN: EditableMembershipPlan = {
  id: "",
  name: "",
  description: "",
  amountMonthlyCents: null,
  amountYearlyCents: null,
  active: true,
  perks: [],
  isDefault: false,
};

/**
 * Converts a cents value to a two-decimal USD string for form inputs.
 *
 * @param value - Monetary amount in cents.
 * @returns Decimal dollar text (e.g. `"12.00"`), or empty string when unavailable.
 */
function formatDollarsFromCents(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "";
  return (value / 100).toFixed(2);
}

/**
 * Parses a user-entered dollar amount into integer cents.
 *
 * @param value - Raw input string from the pricing field.
 * @returns Cents value clamped to zero or greater, or `null` if input is empty/invalid.
 */
function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed * 100));
}

/**
 * Client-rendered group settings page.
 *
 * @param props - Promise-based dynamic route params supplied by the App Router.
 * @returns Admin settings UI for memberships and join controls.
 */
export default function GroupSettingsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const groupId = params.id;

  const [loading, setLoading] = useState(true);
  const [savingJoin, setSavingJoin] = useState(false);
  const [savingMemberships, setSavingMemberships] = useState(false);
  const [groupName, setGroupName] = useState("Group");
  const [groupType, setGroupType] = useState("basic");
  const [error, setError] = useState<string | null>(null);

  const [joinSettings, setJoinSettings] = useState<GroupJoinSettings>({
    joinType: JoinType.Public,
    questions: [],
    approvalRequired: false,
  });

  const [membershipPlans, setMembershipPlans] = useState<EditableMembershipPlan[]>([]);
  const [chatMode, setChatMode] = useState<ChatMode>("both");
  const [hasMatrixRoom, setHasMatrixRoom] = useState(false);
  const [savingChatMode, setSavingChatMode] = useState(false);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [hasGroupPassword, setHasGroupPassword] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [showMembershipGate, setShowMembershipGate] = useState(false);
  const [upgradePending, setUpgradePending] = useState(false);

  // ── Profile tab (folds the former Edit-Profile modal) ──
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [profileLocationText, setProfileLocationText] = useState("");
  const [profileLocationData, setProfileLocationData] = useState<LocationSuggestion | null>(null);
  const [profileTags, setProfileTags] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState("");
  const [coverPreview, setCoverPreview] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Membership price drafts (price-input fix) ──
  // Raw, per-field strings keyed `${planId}:monthly` / `${planId}:yearly` so a
  // partially typed price (e.g. "12.") is preserved across keystrokes instead of
  // being reformatted by parse(format(...)) on every change. Parsed to cents on
  // blur and on save.
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  // ── Map-marker location ──
  const [markerLocationText, setMarkerLocationText] = useState("");
  const [markerLocationData, setMarkerLocationData] = useState<LocationSuggestion | null>(null);
  const [markerLat, setMarkerLat] = useState("");
  const [markerLng, setMarkerLng] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const isOrganization = groupType === "organization";

  useEffect(() => {
    let cancelled = false;

    /**
     * Loads current admin settings for the target group.
     *
     * On access failure, this sets an error state that renders an access-denied card.
     */
    async function loadSettings() {
      setLoading(true);
      const result = await fetchGroupAdminSettings(groupId);

      if (cancelled) return;

      if (!result.success || !result.group) {
        setError(result.error ?? "Unable to load group settings.");
        setLoading(false);
        return;
      }

      setGroupName(result.group.name);
      setGroupType(result.group.groupType === "org" ? "organization" : result.group.groupType);
      setJoinSettings(result.group.joinSettings);
      // Ensure the form always has at least one editable plan entry.
      const loadedPlans: EditableMembershipPlan[] =
        result.group.membershipPlans.length > 0
          ? result.group.membershipPlans
          : [
              {
                id: "basic-member",
                name: "Basic Member",
                description: "Core access to group updates and participation.",
                amountMonthlyCents: 0,
                amountYearlyCents: 0,
                active: true,
                perks: [],
                isDefault: true,
              },
            ];
      setMembershipPlans(loadedPlans);
      // Seed per-field price drafts from the loaded plans (price-input fix).
      const drafts: Record<string, string> = {};
      for (const plan of loadedPlans) {
        drafts[`${plan.id}:monthly`] = formatDollarsFromCents(plan.amountMonthlyCents);
        drafts[`${plan.id}:yearly`] = formatDollarsFromCents(plan.amountYearlyCents);
      }
      setPriceDrafts(drafts);

      // Hydrate the Profile tab.
      setDescription(result.group.description);
      setProfileLocationText(result.group.location);
      setProfileLocationData(null);
      setProfileTags(result.group.tags);
      setCoverImage(result.group.coverImage);
      setCoverPreview(result.group.coverImage);
      setCoverFile(null);
      setCommissionPercent(Math.round(result.group.commissionBps / 100));

      // Hydrate the Map Marker tab location.
      setMarkerLocationText(result.group.location);
      setMarkerLocationData(null);
      setMarkerLat(
        result.group.locationData?.lat !== undefined ? String(result.group.locationData.lat) : "",
      );
      setMarkerLng(
        result.group.locationData?.lng !== undefined ? String(result.group.locationData.lng) : "",
      );

      setModelUrl(result.group.modelUrl ?? null);
      setHasGroupPassword(result.group.hasPassword);

      // Load Matrix room config for chat mode
      try {
        const matrixRoom = await getGroupMatrixRoom(groupId);
        if (matrixRoom) {
          setHasMatrixRoom(true);
          setChatMode(matrixRoom.chatMode);
        }
      } catch {
        // Matrix room lookup is non-critical
      }

      setError(null);
      setLoading(false);
    }

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  /**
   * Persists join settings through the group-admin server action.
   */
  const onSaveJoinSettings = async () => {
    setSavingJoin(true);
    const result = await updateGroupJoinSettings(groupId, joinSettings);
    setSavingJoin(false);

    if (!result.success) {
      toast({ title: "Could not save join settings", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Join settings saved" });
  };

  /**
   * Adds a new in-memory plan row to the memberships editor.
   */
  const onAddPlan = () => {
    setMembershipPlans((prev) => {
      const nextIndex = prev.length + 1;
      const newPlan: EditableMembershipPlan = {
        ...EMPTY_PLAN,
        id: `plan-${Date.now()}-${nextIndex}`,
        name: `Membership ${nextIndex}`,
        isDefault: prev.length === 0,
      };
      // Seed empty price drafts for the new plan so its inputs are controlled.
      setPriceDrafts((drafts) => ({
        ...drafts,
        [`${newPlan.id}:monthly`]: "",
        [`${newPlan.id}:yearly`]: "",
      }));
      return [...prev, newPlan];
    });
  };

  /**
   * Removes a plan and guarantees a default plan still exists when plans remain.
   */
  const onRemovePlan = (id: string) => {
    setMembershipPlans((prev) => {
      const remaining = prev.filter((plan) => plan.id !== id);
      if (remaining.length > 0 && !remaining.some((plan) => plan.isDefault)) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }
      return remaining;
    });
  };

  /**
   * Marks one plan as default and clears the default flag from all others.
   */
  const onSetDefaultPlan = (id: string) => {
    setMembershipPlans((prev) => prev.map((plan) => ({ ...plan, isDefault: plan.id === id })));
  };

  /**
   * Generic controlled-input updater for editable plan fields.
   */
  const onPlanFieldChange = (
    id: string,
    field: keyof EditableMembershipPlan,
    value: string | boolean | number | null | string[]
  ) => {
    setMembershipPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== id) return plan;
        return { ...plan, [field]: value };
      })
    );
  };

  /**
   * Persists membership plans through the group-admin server action.
   */
  const onSaveMembershipPlans = async () => {
    // Flush any unblurred price drafts into the plans before persisting.
    const plansToSave = membershipPlans.map((plan) => ({
      ...plan,
      amountMonthlyCents: parseDollarsToCents(
        priceDrafts[`${plan.id}:monthly`] ?? formatDollarsFromCents(plan.amountMonthlyCents),
      ),
      amountYearlyCents: parseDollarsToCents(
        priceDrafts[`${plan.id}:yearly`] ?? formatDollarsFromCents(plan.amountYearlyCents),
      ),
    }));
    setMembershipPlans(plansToSave);

    setSavingMemberships(true);
    const result = await updateGroupMembershipPlans(groupId, plansToSave);
    setSavingMemberships(false);

    if (!result.success) {
      toast({ title: "Could not save memberships", description: result.error, variant: "destructive" });
      return;
    }

    toast({ title: "Membership plans saved" });
  };

  /**
   * Stages a selected cover image for upload; preview is shown immediately and
   * the file is uploaded on save (mirrors the former Edit-Profile modal).
   */
  const handleCoverSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
    event.target.value = "";
  }, []);

  const handleProfileLocationSelect = useCallback((suggestion: LocationSuggestion) => {
    setProfileLocationText(suggestion.label);
    setProfileLocationData(suggestion);
  }, []);

  const handleMarkerLocationSelect = useCallback((suggestion: LocationSuggestion) => {
    setMarkerLocationText(suggestion.label);
    setMarkerLocationData(suggestion);
    if (typeof suggestion.lat === "number") setMarkerLat(String(suggestion.lat));
    if (typeof suggestion.lon === "number") setMarkerLng(String(suggestion.lon));
  }, []);

  /**
   * Persists the group's profile fields via `updateGroupResource`, reusing the
   * same metadata-patch shape the former Edit-Profile modal produced.
   */
  const onSaveProfile = async () => {
    if (!groupName.trim()) {
      toast({ title: "Name required", description: "Group name cannot be empty.", variant: "destructive" });
      return;
    }

    setSavingProfile(true);
    try {
      let finalCoverUrl = coverImage;

      if (coverFile) {
        setUploadingCover(true);
        const formData = new FormData();
        formData.append("file", coverFile);
        formData.append("bucket", "avatars");
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadJson = await uploadRes.json();
        setUploadingCover(false);
        if (!uploadRes.ok || !uploadJson.results?.[0]?.url) {
          toast({ title: "Cover upload failed", description: uploadJson.error || "Could not upload image.", variant: "destructive" });
          setSavingProfile(false);
          return;
        }
        finalCoverUrl = uploadJson.results[0].url;
      }

      const metadataPatch: Record<string, unknown> = {
        coverImage: finalCoverUrl,
        chapterTags: profileTags,
        tags: profileTags,
      };

      if (isOrganization) {
        metadataPatch.commissionBps = clampPercent(commissionPercent) * 100;
      }

      if (profileLocationData) {
        metadataPatch.location = {
          name: profileLocationData.label,
          city: profileLocationData.locality ?? profileLocationData.name ?? profileLocationData.label,
          lat: profileLocationData.lat,
          lng: profileLocationData.lon,
        };
      } else if (profileLocationText.trim()) {
        metadataPatch.location = profileLocationText.trim();
      } else {
        metadataPatch.location = null;
      }

      const result = await updateGroupResource({
        groupId,
        name: groupName.trim(),
        description: description.trim(),
        metadataPatch,
      });

      if (result.success) {
        setCoverImage(finalCoverUrl);
        setCoverFile(null);
        toast({ title: "Group profile updated" });
        router.refresh();
      } else {
        toast({ title: "Update failed", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Update failed", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setSavingProfile(false);
      setUploadingCover(false);
    }
  };

  /**
   * Persists the group's map-marker location (place + optional manual lat/lng)
   * as a structured `metadata.location` object via `updateGroupResource`.
   */
  const onSaveLocation = async () => {
    setSavingLocation(true);
    try {
      const lat = markerLat.trim() ? Number(markerLat.trim()) : undefined;
      const lng = markerLng.trim() ? Number(markerLng.trim()) : undefined;

      if ((markerLat.trim() && !Number.isFinite(lat)) || (markerLng.trim() && !Number.isFinite(lng))) {
        toast({ title: "Invalid coordinates", description: "Latitude and longitude must be numbers.", variant: "destructive" });
        setSavingLocation(false);
        return;
      }

      const name = markerLocationData?.label ?? markerLocationText.trim();
      if (!name && lat === undefined && lng === undefined) {
        const cleared = await updateGroupResource({ groupId, metadataPatch: { location: null } });
        if (!cleared.success) {
          toast({ title: "Could not save location", description: cleared.message, variant: "destructive" });
        } else {
          toast({ title: "Location cleared" });
        }
        setSavingLocation(false);
        return;
      }

      const location: Record<string, unknown> = {
        name,
        city: markerLocationData?.locality ?? markerLocationData?.name ?? name,
        lat: lat ?? markerLocationData?.lat,
        lng: lng ?? markerLocationData?.lon,
      };

      const result = await updateGroupResource({ groupId, metadataPatch: { location } });
      if (!result.success) {
        toast({ title: "Could not save location", description: result.message, variant: "destructive" });
      } else {
        toast({ title: "Map marker location saved" });
        router.refresh();
      }
    } catch {
      toast({ title: "Could not save location", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setSavingLocation(false);
    }
  };

  /**
   * Handles GLB file selection: uploads to MinIO and saves URL to group metadata.
   */
  const onUploadModel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "model/gltf-binary" && !file.name.endsWith(".glb")) {
      toast({ title: "Invalid file type", description: "Only .glb files are accepted.", variant: "destructive" });
      return;
    }

    setUploadingModel(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "uploads");

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: "Upload failed" }));
        toast({ title: "Upload failed", description: err.error || "Could not upload model file.", variant: "destructive" });
        setUploadingModel(false);
        return;
      }

      const uploadData = await uploadRes.json();
      const url = uploadData.results?.[0]?.url;
      if (!url) {
        toast({ title: "Upload failed", description: "No URL returned from upload.", variant: "destructive" });
        setUploadingModel(false);
        return;
      }

      const result = await updateGroupResource({ groupId, metadataPatch: { modelUrl: url } });
      if (!result.success) {
        toast({ title: "Could not save model", description: result.message, variant: "destructive" });
      } else {
        setModelUrl(url);
        toast({ title: "3D model uploaded and saved" });
      }
    } catch {
      toast({ title: "Upload error", description: "An unexpected error occurred.", variant: "destructive" });
    }
    setUploadingModel(false);
  };

  /**
   * Removes the GLB model URL from group metadata.
   */
  const onRemoveModel = async () => {
    setSavingModel(true);
    const result = await updateGroupResource({ groupId, metadataPatch: { modelUrl: null } });
    if (!result.success) {
      toast({ title: "Could not remove model", description: result.message, variant: "destructive" });
    } else {
      setModelUrl(null);
      toast({ title: "3D model removed" });
    }
    setSavingModel(false);
  };

  /**
   * Persists the chat mode selection for this group's Matrix room.
   */
  const onSaveChatMode = async () => {
    setSavingChatMode(true);
    try {
      await setGroupChatMode({ groupAgentId: groupId, chatMode });
      toast({ title: "Chat mode updated" });
    } catch {
      toast({ title: "Could not update chat mode", variant: "destructive" });
    }
    setSavingChatMode(false);
  };

  const upgradeToOrganization = async () => {
    setUpgradePending(true);
    const result = await updateGroupResource({
      groupId,
      metadataPatch: { groupType: "organization" },
    });
    setUpgradePending(false);

    if (!result.success) {
      if (result.error?.code === "SUBSCRIPTION_REQUIRED") {
        setShowMembershipGate(true);
        return;
      }
      toast({ title: "Could not upgrade group", description: result.message, variant: "destructive" });
      return;
    }

    setGroupType("organization");
    toast({ title: "Organization enabled" });
    router.refresh();
  };

  useEffect(() => {
    if (searchParams.get(RESUME_ORG_UPGRADE_PARAM) !== "1" || groupType === "organization") return;

    void (async () => {
      const subscription = await getSubscriptionStatusAction().catch(() => null);
      const tierRank: Record<MembershipTier, number> = {
        basic: 0,
        host: 1,
        seller: 2,
        organizer: 3,
        steward: 4,
      };
      if (!subscription || tierRank[subscription.tier] < tierRank.organizer) return;

      await upgradeToOrganization();
      router.replace(`/groups/${groupId}/settings`);
    })();
  }, [groupId, groupType, router, searchParams]);

  // Conditional render for initial client fetch state.
  if (loading) {
    return <div className="container max-w-4xl mx-auto p-4">Loading settings...</div>;
  }

  // Conditional render for failed admin check or unavailable group settings.
  if (error) {
    return (
      <div className="container max-w-4xl mx-auto p-4 space-y-4">
        <Button variant="ghost" onClick={() => router.back()} className="w-fit">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push(`/groups/${groupId}`)}>Return to group</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-20 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">{groupName} Settings</h1>
        </div>
        <Button variant="outline" onClick={() => router.push(`/groups/${groupId}`)}>
          View Group
        </Button>
      </div>

      <Tabs defaultValue={resolveDefaultTab(searchParams.get("tab"))} className="space-y-6">
        <ResponsiveTabsList>
          <TabsTrigger value="profile" className="inline-flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="memberships" className="inline-flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Memberships
          </TabsTrigger>
          <TabsTrigger value="join" className="inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Join Settings
          </TabsTrigger>
          <TabsTrigger value="requests" className="inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Requests
          </TabsTrigger>
          <TabsTrigger value="chat" className="inline-flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat
          </TabsTrigger>
          <TabsTrigger value="announcements" className="inline-flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Announcements
          </TabsTrigger>
          <TabsTrigger value="map-marker" className="inline-flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Map Marker
          </TabsTrigger>
          <TabsTrigger value="admin-overview" className="inline-flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Admin Overview
          </TabsTrigger>
        </ResponsiveTabsList>

        {/* Profile tab folds the former Edit-Profile modal into settings. */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                Edit your group&apos;s public profile: cover image, name, description,
                location, and tags.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Cover Image */}
              <div className="space-y-2">
                <Label>Cover Image</Label>
                <button
                  type="button"
                  className="relative w-full h-32 rounded-lg border bg-muted overflow-hidden group cursor-pointer"
                  onClick={() => coverInputRef.current?.click()}
                >
                  {coverPreview ? (
                    <Image src={coverPreview} alt="Cover preview" fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                      Click to upload cover image
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {uploadingCover && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-sm">Uploading...</span>
                    </div>
                  )}
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverSelect}
                />
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="profile-name">Name</Label>
                <Input
                  id="profile-name"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Group name"
                  maxLength={120}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="profile-description">Description</Label>
                <Textarea
                  id="profile-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe your group..."
                  rows={4}
                  maxLength={2000}
                />
              </div>

              {/* Location */}
              <div className="space-y-2">
                <Label>Location</Label>
                <LocationAutocompleteInput
                  value={profileLocationText}
                  onValueChange={setProfileLocationText}
                  onSelectSuggestion={handleProfileLocationSelect}
                  placeholder="Search for a location..."
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <TagEditor tags={profileTags} setTags={setProfileTags} placeholder="Add tags and press Enter..." />
              </div>

              {/* Mart commission — organizations only */}
              {isOrganization && (
                <div className="space-y-2">
                  <Label htmlFor="commission-percent">Mart Commission (%)</Label>
                  <Input
                    id="commission-percent"
                    type="number"
                    min={0}
                    max={MAX_COMMISSION_PERCENT}
                    step={1}
                    value={commissionPercent}
                    onChange={(event) => setCommissionPercent(clampPercent(parseInt(event.target.value, 10)))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Percentage taken from member sales in your mart (0&ndash;{MAX_COMMISSION_PERCENT}%)
                  </p>
                </div>
              )}

              <Button type="button" onClick={onSaveProfile} disabled={savingProfile}>
                {savingProfile ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Profile"
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="memberships" className="space-y-4">
          {groupType !== "organization" ? (
            <Card>
              <CardHeader>
                <CardTitle>Upgrade To Organization</CardTitle>
                <CardDescription>
                  Convert this basic group into an organization. Organizer membership is required.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => void upgradeToOrganization()} disabled={upgradePending}>
                  {upgradePending ? "Processing..." : "Change Group Type To Org"}
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Membership Subscriptions</CardTitle>
              <CardDescription>
                Configure recurring membership options for this group. Plans appear on the group About page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Zero-state guidance when no plans are currently in local form state. */}
              {membershipPlans.length === 0 ? (
                <p className="text-sm text-muted-foreground">No plans yet. Add your first membership plan.</p>
              ) : null}

              {/* Render one editable card per membership plan in local state. */}
              {membershipPlans.map((plan) => (
                <div key={plan.id} className="rounded-md border p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Plan Name</Label>
                      <Input
                        value={plan.name}
                        onChange={(event) => onPlanFieldChange(plan.id, "name", event.target.value)}
                        placeholder="Host Membership"
                      />
                    </div>
                    <div className="flex items-end gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.active}
                          onCheckedChange={(checked) => onPlanFieldChange(plan.id, "active", checked)}
                        />
                        <Label>Active</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={plan.isDefault}
                          onCheckedChange={(checked) => {
                            if (checked) onSetDefaultPlan(plan.id);
                          }}
                        />
                        <Label>Default</Label>
                      </div>
                      <Button variant="destructive" size="sm" onClick={() => onRemovePlan(plan.id)}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      rows={2}
                      value={plan.description}
                      onChange={(event) => onPlanFieldChange(plan.id, "description", event.target.value)}
                      placeholder="Access to member events and governance."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Monthly Price (USD)</Label>
                      <Input
                        inputMode="decimal"
                        value={priceDrafts[`${plan.id}:monthly`] ?? formatDollarsFromCents(plan.amountMonthlyCents)}
                        onChange={(event) =>
                          setPriceDrafts((drafts) => ({
                            ...drafts,
                            [`${plan.id}:monthly`]: sanitizePriceInput(event.target.value),
                          }))
                        }
                        onBlur={() => {
                          const cents = parseDollarsToCents(priceDrafts[`${plan.id}:monthly`] ?? "");
                          onPlanFieldChange(plan.id, "amountMonthlyCents", cents);
                          setPriceDrafts((drafts) => ({ ...drafts, [`${plan.id}:monthly`]: formatDollarsFromCents(cents) }));
                        }}
                        placeholder="22.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Yearly Price (USD)</Label>
                      <Input
                        inputMode="decimal"
                        value={priceDrafts[`${plan.id}:yearly`] ?? formatDollarsFromCents(plan.amountYearlyCents)}
                        onChange={(event) =>
                          setPriceDrafts((drafts) => ({
                            ...drafts,
                            [`${plan.id}:yearly`]: sanitizePriceInput(event.target.value),
                          }))
                        }
                        onBlur={() => {
                          const cents = parseDollarsToCents(priceDrafts[`${plan.id}:yearly`] ?? "");
                          onPlanFieldChange(plan.id, "amountYearlyCents", cents);
                          setPriceDrafts((drafts) => ({ ...drafts, [`${plan.id}:yearly`]: formatDollarsFromCents(cents) }));
                        }}
                        placeholder="220.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Stripe Price ID (Monthly)</Label>
                      <Input
                        value={plan.stripePriceIdMonthly ?? ""}
                        onChange={(event) => onPlanFieldChange(plan.id, "stripePriceIdMonthly", event.target.value)}
                        placeholder="price_..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Stripe Price ID (Yearly)</Label>
                      <Input
                        value={plan.stripePriceIdYearly ?? ""}
                        onChange={(event) => onPlanFieldChange(plan.id, "stripePriceIdYearly", event.target.value)}
                        placeholder="price_..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Perks (one per line)</Label>
                    <Textarea
                      rows={3}
                      value={(plan.perks ?? []).join("\n")}
                      onChange={(event) =>
                        onPlanFieldChange(
                          plan.id,
                          "perks",
                          event.target.value
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean)
                        )
                      }
                      placeholder="Priority support\nDiscounted event tickets"
                    />
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={onAddPlan}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Plan
                </Button>
                <Button type="button" onClick={onSaveMembershipPlans} disabled={savingMemberships}>
                  {savingMemberships ? "Saving..." : "Save Membership Plans"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Join tab controls how users can discover/apply/invite into the group. */}
        <TabsContent value="join" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Join Settings</CardTitle>
              <CardDescription>Control how people join this group.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="join-visibility">Discovery</Label>
                <select
                  id="join-visibility"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={joinSettings.visibility ?? "public"}
                  onChange={(event) =>
                    setJoinSettings((prev) => ({
                      ...prev,
                      visibility: event.target.value === "hidden" ? "hidden" : "public",
                    }))
                  }
                >
                  <option value="public">Public</option>
                  <option value="hidden">Hidden</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="join-type">Join Type</Label>
                <select
                  id="join-type"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={joinSettings.joinType}
                  onChange={(event) =>
                    setJoinSettings((prev) => ({
                      ...prev,
                      joinType: event.target.value as JoinType,
                      approvalRequired:
                        event.target.value === JoinType.ApprovalRequired ||
                        event.target.value === JoinType.InviteAndApply,
                    }))
                  }
                >
                  <option value={JoinType.Public}>Open</option>
                  <option value={JoinType.ApprovalRequired}>Apply and approve</option>
                  <option value={JoinType.InviteOnly}>Invite Only</option>
                  <option value={JoinType.InviteAndApply}>Invite + apply and approve</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-link">Invite Link</Label>
                <Input
                  id="invite-link"
                  value={joinSettings.inviteLink ?? ""}
                  onChange={(event) =>
                    setJoinSettings((prev) => ({ ...prev, inviteLink: event.target.value }))
                  }
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="application-instructions">Application Instructions</Label>
                <Textarea
                  id="application-instructions"
                  rows={4}
                  value={joinSettings.applicationInstructions ?? ""}
                  onChange={(event) =>
                    setJoinSettings((prev) => ({ ...prev, applicationInstructions: event.target.value }))
                  }
                  placeholder="Tell applicants what to include in their request."
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={Boolean(joinSettings.approvalRequired)}
                  onCheckedChange={(checked) =>
                    setJoinSettings((prev) => ({ ...prev, approvalRequired: checked }))
                  }
                />
                <Label>Require admin approval</Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={Boolean(joinSettings.passwordRequired)}
                  onCheckedChange={(checked) =>
                    setJoinSettings((prev) => ({ ...prev, passwordRequired: checked }))
                  }
                />
                <Label>Require password challenge</Label>
              </div>

              <JoinQuestionEditor
                value={joinSettings.questions ?? []}
                onChange={(questions) =>
                  setJoinSettings((prev) => ({ ...prev, questions }))
                }
              />

              <Button type="button" onClick={onSaveJoinSettings} disabled={savingJoin}>
                {savingJoin ? "Saving..." : "Save Join Settings"}
              </Button>
            </CardContent>
          </Card>

          <GroupAdminPassword groupId={groupId} hasPassword={hasGroupPassword} />
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <GroupJoinRequestsCard groupId={groupId} />
        </TabsContent>

        {/* Chat tab controls the group's messaging mode (ledger/matrix/both). */}
        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chat Settings</CardTitle>
              <CardDescription>
                Configure how group members communicate. Choose between the public
                knowledge graph feed, private Matrix chat, or both.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasMatrixRoom ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="chat-mode">Chat Mode</Label>
                    <select
                      id="chat-mode"
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      value={chatMode}
                      onChange={(event) =>
                        setChatMode(event.target.value as ChatMode)
                      }
                    >
                      <option value="both">Both (Feed + Chat)</option>
                      <option value="ledger">Feed Only (Knowledge Graph)</option>
                      <option value="matrix">Chat Only (Private Matrix)</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {chatMode === "both" &&
                        "Members can use both the public feed for discoverable content and private Matrix chat."}
                      {chatMode === "ledger" &&
                        "Members can only post to the public feed. All content is searchable in the knowledge graph."}
                      {chatMode === "matrix" &&
                        "Members use private Matrix chat only. Messages are not indexed in the knowledge graph."}
                    </p>
                  </div>

                  <Button
                    type="button"
                    onClick={onSaveChatMode}
                    disabled={savingChatMode}
                  >
                    {savingChatMode ? "Saving..." : "Save Chat Settings"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Matrix chat has not been configured for this group yet. It will
                  be set up automatically when the group is created with chat
                  enabled.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-4">
          <GroupBroadcastCard groupId={groupId} groupName={groupName} />
        </TabsContent>

        {/* Admin Overview tab renders the GroupAdminView component with data mapped from settings state. */}
        <TabsContent value="admin-overview" className="space-y-4">
          <GroupAdminView
            group={{
              id: groupId,
              name: groupName,
              description: "",
              image: "",
              memberCount: 0,
              createdAt: new Date().toISOString(),
              type: groupType === "organization" ? LegacyGroupType.Organization : LegacyGroupType.Basic,
              modelUrl: modelUrl ?? undefined,
            } satisfies LegacyGroup}
          />
        </TabsContent>

        {/* Map Marker tab: location placement + optional GLB 3D marker model. */}
        <TabsContent value="map-marker" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Map Location</CardTitle>
              <CardDescription>
                Set where this group appears on the map. Search for a place, or enter
                latitude/longitude directly for precise placement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Place</Label>
                <LocationAutocompleteInput
                  value={markerLocationText}
                  onValueChange={setMarkerLocationText}
                  onSelectSuggestion={handleMarkerLocationSelect}
                  placeholder="Search for a place..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="marker-lat">Latitude (optional)</Label>
                  <Input
                    id="marker-lat"
                    inputMode="decimal"
                    value={markerLat}
                    onChange={(event) => setMarkerLat(event.target.value)}
                    placeholder="40.0150"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marker-lng">Longitude (optional)</Label>
                  <Input
                    id="marker-lng"
                    inputMode="decimal"
                    value={markerLng}
                    onChange={(event) => setMarkerLng(event.target.value)}
                    placeholder="-105.2705"
                  />
                </div>
              </div>
              <Button type="button" onClick={onSaveLocation} disabled={savingLocation}>
                {savingLocation ? "Saving..." : "Save Map Location"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3D Map Marker</CardTitle>
              <CardDescription>
                Upload a .glb 3D model to use as this group&apos;s marker on the map instead of the default point.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {modelUrl ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Current Model</Label>
                    <p className="text-sm text-muted-foreground break-all">{modelUrl}</p>
                  </div>
                  <div className="flex gap-2">
                    <Label
                      htmlFor="glb-replace"
                      className="inline-flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                    >
                      {uploadingModel ? "Uploading..." : "Replace Model"}
                      <input
                        id="glb-replace"
                        type="file"
                        accept=".glb,model/gltf-binary"
                        className="hidden"
                        onChange={onUploadModel}
                        disabled={uploadingModel}
                      />
                    </Label>
                    <Button
                      variant="destructive"
                      onClick={onRemoveModel}
                      disabled={savingModel}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {savingModel ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No 3D model uploaded. Upload a .glb file to replace the default map marker.
                  </p>
                  <Label
                    htmlFor="glb-upload"
                    className="inline-flex items-center gap-2 cursor-pointer rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
                  >
                    {uploadingModel ? "Uploading..." : "Upload .glb Model"}
                    <input
                      id="glb-upload"
                      type="file"
                      accept=".glb,model/gltf-binary"
                      className="hidden"
                      onChange={onUploadModel}
                      disabled={uploadingModel}
                    />
                  </Label>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SubscriptionGateDialog
        open={showMembershipGate}
        onOpenChange={setShowMembershipGate}
        requiredTier="organizer"
        featureDescription="Changing a basic group into an organization requires an Organizer membership or higher."
        onTrialStarted={() => void upgradeToOrganization()}
        returnPath={`/groups/${groupId}/settings?${RESUME_ORG_UPGRADE_PARAM}=1`}
      />
    </div>
  );
}

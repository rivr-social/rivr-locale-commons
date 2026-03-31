import { NextResponse } from "next/server";
import { buildAppReleaseStatus } from "@/lib/app-release";

export async function GET() {
  const status = await buildAppReleaseStatus({
    appName: "rivr-locale-commons",
    defaultVersion: "1.0.0",
    defaultUpstreamRepo: "rivr-social/rivr-locale-commons",
  });

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "s-maxage=300, stale-while-revalidate=300",
    },
  });
}

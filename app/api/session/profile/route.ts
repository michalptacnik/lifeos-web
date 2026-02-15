import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "../../../../lib/auth";

const API_BASE = process.env.LIFEOS_API_BASE_URL ?? "http://127.0.0.1:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

const weakInternalKeyValues = new Set(["replace_with_shared_internal_key", "change_me_shared_internal_api_key_min_32_chars"]);

function hasStrongInternalKey(value?: string) {
  if (!value) return false;
  if (weakInternalKeyValues.has(value)) return false;
  return value.length >= 32;
}

export async function GET() {
  const session = await getServerSession(buildAuthOptions());
  const actorEmail = session?.user?.email?.toLowerCase();
  if (!actorEmail) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!hasStrongInternalKey(INTERNAL_API_KEY)) {
    return NextResponse.json({ message: "Server misconfigured: INTERNAL_API_KEY missing" }, { status: 500 });
  }

  const headers: Record<string, string> = {
    "x-user-email": actorEmail
  };
  if (INTERNAL_API_KEY) {
    headers["x-internal-api-key"] = INTERNAL_API_KEY;
  }

  const response = await fetch(`${API_BASE}/me`, {
    method: "GET",
    headers,
    cache: "no-store"
  });

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";
  return new NextResponse(responseText, {
    status: response.status,
    headers: { "content-type": contentType }
  });
}

import { NextRequest, NextResponse } from "next/server";
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

function resolveDevBypass() {
  const bypassEnabled = process.env.ALLOW_DEV_AUTH_BYPASS === "true";
  const bypassEmail = process.env.DEV_AUTH_BYPASS_EMAIL?.trim().toLowerCase() ?? "";
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && (bypassEnabled || bypassEmail)) {
    return { error: "Server misconfigured: dev auth bypass is forbidden in production" };
  }

  if (!bypassEnabled) {
    return { actorEmail: undefined as string | undefined };
  }

  if (!bypassEmail) {
    return { error: "Server misconfigured: DEV_AUTH_BYPASS_EMAIL missing" };
  }

  return { actorEmail: bypassEmail };
}

async function proxy(request: NextRequest, path: string[]) {
  const bypass = resolveDevBypass();
  if (bypass.error) {
    return NextResponse.json({ message: bypass.error }, { status: 500 });
  }

  const session = await getServerSession(buildAuthOptions());
  const actorEmail = session?.user?.email?.toLowerCase() ?? bypass.actorEmail;

  if (!actorEmail) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!hasStrongInternalKey(INTERNAL_API_KEY)) {
    return NextResponse.json({ message: "Server misconfigured: INTERNAL_API_KEY missing" }, { status: 500 });
  }

  const target = `${API_BASE}/${path.join("/")}${request.nextUrl.search}`;
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();
  const headers: Record<string, string> = {
    "content-type": request.headers.get("content-type") ?? "application/json",
    "x-user-email": actorEmail
  };
  if (INTERNAL_API_KEY) {
    headers["x-internal-api-key"] = INTERNAL_API_KEY;
  }

  const response = await fetch(target, {
    method: request.method,
    headers,
    body,
    cache: "no-store"
  });

  const responseText = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return new NextResponse(responseText, {
    status: response.status,
    headers: { "content-type": contentType }
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxy(request, params.path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxy(request, params.path);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxy(request, params.path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params;
  return proxy(request, params.path);
}

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "../../../../lib/auth";
import { createMatrixBridgeToken } from "../../../../lib/matrix-bridge";

const API_BASE = process.env.LIFEOS_API_BASE_URL ?? "http://127.0.0.1:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
const weakInternalKeyValues = new Set(["replace_with_shared_internal_key", "change_me_shared_internal_api_key_min_32_chars"]);

function hasStrongInternalKey(value?: string) {
  if (!value) return false;
  if (weakInternalKeyValues.has(value)) return false;
  return value.length >= 32;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(buildAuthOptions());
  const actorEmail = session?.user?.email?.toLowerCase();
  const actorDisplayName = session?.user?.name ?? null;

  if (!actorEmail) {
    return NextResponse.json(
      { code: "SESSION_MISSING", message: "Sign in required for Matrix access", recoverable: true },
      { status: 401 }
    );
  }

  if (!NEXTAUTH_SECRET) {
    return NextResponse.json({ message: "Server misconfigured: NEXTAUTH secret missing" }, { status: 500 });
  }

  const token = await getToken({ req: request, secret: NEXTAUTH_SECRET });
  const exp = typeof token?.exp === "number" ? token.exp : undefined;
  if (exp && exp * 1000 <= Date.now()) {
    return NextResponse.json(
      { code: "SESSION_EXPIRED", message: "Session expired. Please sign in again.", recoverable: true },
      { status: 401 }
    );
  }

  if (!hasStrongInternalKey(INTERNAL_API_KEY)) {
    return NextResponse.json({ message: "Server misconfigured: INTERNAL_API_KEY missing" }, { status: 500 });
  }
  const internalKey = INTERNAL_API_KEY as string;

  const roomsResponse = await fetch(`${API_BASE}/matrix/rooms`, {
    method: "GET",
    headers: {
      "x-user-email": actorEmail,
      "x-internal-api-key": internalKey
    },
    cache: "no-store"
  });

  if (roomsResponse.status === 401 || roomsResponse.status === 403) {
    return NextResponse.json(
      { code: "MATRIX_AUTH_REJECTED", message: "Matrix authorization failed for current session", recoverable: true },
      { status: 401 }
    );
  }

  if (!roomsResponse.ok) {
    return NextResponse.json({ message: "Matrix session bootstrap failed" }, { status: 502 });
  }

  const rooms = (await roomsResponse.json()) as unknown;
  const now = Math.floor(Date.now() / 1000);
  const bridgeTtlSeconds = 5 * 60;
  const bridgeToken = createMatrixBridgeToken(
    {
      sub: token?.sub ?? actorEmail,
      email: actorEmail,
      iat: now,
      exp: now + bridgeTtlSeconds
    },
    NEXTAUTH_SECRET
  );

  return NextResponse.json({
    status: "ok",
    actor: {
      email: actorEmail,
      displayName: actorDisplayName
    },
    bridge: {
      token: bridgeToken,
      expiresAt: new Date((now + bridgeTtlSeconds) * 1000).toISOString()
    },
    rooms
  });
}

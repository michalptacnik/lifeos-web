import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { buildAuthOptions } from "../../../../lib/auth";

const API_BASE = process.env.LIFEOS_API_BASE_URL ?? "http://127.0.0.1:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const DEV_AUTH_BYPASS_EMAIL = process.env.DEV_AUTH_BYPASS_EMAIL?.toLowerCase();

async function proxy(request: NextRequest, path: string[]) {
  const session = await getServerSession(buildAuthOptions());
  const actorEmail = session?.user?.email?.toLowerCase() ?? DEV_AUTH_BYPASS_EMAIL;

  if (!actorEmail) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!INTERNAL_API_KEY) {
    return NextResponse.json({ message: "Server misconfigured: INTERNAL_API_KEY missing" }, { status: 500 });
  }

  const target = `${API_BASE}/${path.join("/")}${request.nextUrl.search}`;
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();

  const response = await fetch(target, {
    method: request.method,
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "x-user-email": actorEmail,
      "x-internal-api-key": INTERNAL_API_KEY
    },
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

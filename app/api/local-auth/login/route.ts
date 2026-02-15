import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.LIFEOS_API_BASE_URL ?? "http://127.0.0.1:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

function readCsrfTokenFromCookie(request: NextRequest) {
  const raw = request.cookies.get("__Host-next-auth.csrf-token")?.value
    ?? request.cookies.get("next-auth.csrf-token")?.value;
  if (!raw) return null;
  const [token] = raw.split("|");
  return token || null;
}

export async function POST(request: NextRequest) {
  const csrfHeader = request.headers.get("x-csrf-token");
  const csrfCookie = readCsrfTokenFromCookie(request);
  if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
    return NextResponse.json({ message: "CSRF validation failed" }, { status: 403 });
  }

  const body = await request.text();
  const headers: Record<string, string> = {
    "content-type": request.headers.get("content-type") ?? "application/json"
  };

  if (INTERNAL_API_KEY) {
    headers["x-internal-api-key"] = INTERNAL_API_KEY;
  }

  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
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

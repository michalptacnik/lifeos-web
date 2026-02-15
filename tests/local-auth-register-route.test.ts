import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

describe("local auth register route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LIFEOS_API_BASE_URL = "http://127.0.0.1:4000";
    process.env.INTERNAL_API_KEY = "12345678901234567890123456789012";
  });

  it("returns 403 when csrf header is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("../app/api/local-auth/register/route");

    const req = new NextRequest("http://localhost/api/local-auth/register", {
      method: "POST",
      headers: {
        cookie: "next-auth.csrf-token=abc|hash",
        "content-type": "application/json"
      },
      body: JSON.stringify({ email: "x@example.com", password: "password123" })
    });
    const res = await mod.POST(req);

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 403 when csrf token mismatches cookie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("../app/api/local-auth/register/route");

    const req = new NextRequest("http://localhost/api/local-auth/register", {
      method: "POST",
      headers: {
        cookie: "next-auth.csrf-token=abc|hash",
        "x-csrf-token": "def",
        "content-type": "application/json"
      },
      body: JSON.stringify({ email: "x@example.com", password: "password123" })
    });
    const res = await mod.POST(req);

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies request when csrf token is valid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { email: "x@example.com" } }), {
        status: 201,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("../app/api/local-auth/register/route");

    const req = new NextRequest("http://localhost/api/local-auth/register", {
      method: "POST",
      headers: {
        cookie: "next-auth.csrf-token=abc|hash",
        "x-csrf-token": "abc",
        "content-type": "application/json"
      },
      body: JSON.stringify({ email: "x@example.com", password: "password123" })
    });
    const res = await mod.POST(req);

    expect(res.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

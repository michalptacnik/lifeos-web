import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock
}));

describe("lifeos web proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LIFEOS_API_BASE_URL = "http://127.0.0.1:4000";
    process.env.INTERNAL_API_KEY = "12345678901234567890123456789012";
    process.env.ALLOW_DEV_AUTH_BYPASS = "false";
    process.env.DEV_AUTH_BYPASS_EMAIL = "";
  });

  it("returns 401 when no session and bypass disabled", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const mod = await import("../app/api/lifeos/[...path]/route");
    const req = new NextRequest("http://localhost/api/lifeos/tasks");
    const res = await mod.GET(req, { params: Promise.resolve({ path: ["tasks"] }) });

    expect(res.status).toBe(401);
  });

  it("proxies request with dev bypass only when explicitly enabled", async () => {
    process.env.ALLOW_DEV_AUTH_BYPASS = "true";
    process.env.DEV_AUTH_BYPASS_EMAIL = "dev@example.com";
    getServerSessionMock.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../app/api/lifeos/[...path]/route");
    const req = new NextRequest("http://localhost/api/lifeos/tasks?x=1");
    const res = await mod.GET(req, { params: Promise.resolve({ path: ["tasks"] }) });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(target).toBe("http://127.0.0.1:4000/tasks?x=1");
    expect((init.headers as Record<string, string>)["x-user-email"]).toBe("dev@example.com");
  });

  it("returns 500 for weak internal key configuration", async () => {
    process.env.INTERNAL_API_KEY = "replace_with_shared_internal_key";
    getServerSessionMock.mockResolvedValue({ user: { email: "member@example.com" } });

    const mod = await import("../app/api/lifeos/[...path]/route");
    const req = new NextRequest("http://localhost/api/lifeos/tasks");
    const res = await mod.GET(req, { params: Promise.resolve({ path: ["tasks"] }) });

    expect(res.status).toBe(500);
  });
});

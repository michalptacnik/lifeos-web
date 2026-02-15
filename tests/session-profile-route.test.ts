import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerSessionMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock
}));

describe("session profile route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LIFEOS_API_BASE_URL = "http://127.0.0.1:4000";
    process.env.INTERNAL_API_KEY = "12345678901234567890123456789012";
  });

  it("returns 401 when session is missing", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("../app/api/session/profile/route");

    const res = await mod.GET();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies /me with session email", async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: "dev@example.com" } });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user: { email: "dev@example.com" }, household: null }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("../app/api/session/profile/route");

    const res = await mod.GET();
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(target).toBe("http://127.0.0.1:4000/me");
    expect((init.headers as Record<string, string>)["x-user-email"]).toBe("dev@example.com");
  });
});

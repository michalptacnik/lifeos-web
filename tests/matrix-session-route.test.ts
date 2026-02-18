import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerSessionMock = vi.fn();
const getTokenMock = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock
}));

describe("matrix session bridge route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LIFEOS_API_BASE_URL = "http://127.0.0.1:4000";
    process.env.INTERNAL_API_KEY = "12345678901234567890123456789012";
    process.env.NEXTAUTH_SECRET = "nextauth_super_secret_for_tests_only";
  });

  it("returns 401 when session is missing", async () => {
    getServerSessionMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../app/api/matrix/session/route");
    const req = new NextRequest("http://localhost/api/matrix/session");
    const res = await mod.GET(req);

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 401 when session token is expired", async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: "dev@example.com", name: "Dev" } });
    getTokenMock.mockResolvedValue({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 10 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../app/api/matrix/session/route");
    const req = new NextRequest("http://localhost/api/matrix/session");
    const res = await mod.GET(req);

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns bridge token and rooms for valid session", async () => {
    getServerSessionMock.mockResolvedValue({ user: { email: "dev@example.com", name: "Dev" } });
    getTokenMock.mockResolvedValue({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "r1", name: "LifeOS" }]), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const mod = await import("../app/api/matrix/session/route");
    const req = new NextRequest("http://localhost/api/matrix/session");
    const res = await mod.GET(req);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(typeof payload.bridge?.token).toBe("string");
    expect(payload.rooms).toHaveLength(1);
    const [target, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(target).toBe("http://127.0.0.1:4000/matrix/rooms");
    expect((init.headers as Record<string, string>)["x-user-email"]).toBe("dev@example.com");
  });
});

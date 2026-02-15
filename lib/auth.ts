import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type RuntimeOAuthConfig = {
  googleClientId?: string;
  googleClientSecret?: string;
  appleClientId?: string;
  appleClientSecret?: string;
};

const oauthFile = join(process.cwd(), ".oauth.runtime.json");
const API_BASE = process.env.LIFEOS_API_BASE_URL ?? "http://127.0.0.1:4000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const weakInternalKeyValues = new Set(["replace_with_shared_internal_key", "change_me_shared_internal_api_key_min_32_chars"]);

function hasStrongInternalKey(value?: string) {
  if (!value) return false;
  if (weakInternalKeyValues.has(value)) return false;
  return value.length >= 32;
}

function readRuntimeOAuthConfig(): RuntimeOAuthConfig {
  if (!existsSync(oauthFile)) {
    return {};
  }

  try {
    const raw = readFileSync(oauthFile, "utf8");
    const parsed = JSON.parse(raw) as RuntimeOAuthConfig;
    return parsed;
  } catch {
    return {};
  }
}

export function getOAuthProviderStatus() {
  const runtime = readRuntimeOAuthConfig();
  const googleClientId = process.env.GOOGLE_CLIENT_ID || runtime.googleClientId || "";
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || runtime.googleClientSecret || "";
  const appleClientId = process.env.APPLE_CLIENT_ID || runtime.appleClientId || "";
  const appleClientSecret = process.env.APPLE_CLIENT_SECRET || runtime.appleClientSecret || "";

  return {
    google: Boolean(googleClientId && googleClientSecret),
    apple: Boolean(appleClientId && appleClientSecret)
  };
}

export function buildAuthOptions(): NextAuthOptions {
  const runtime = readRuntimeOAuthConfig();
  const providers: NextAuthOptions["providers"] = [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().trim().toLowerCase();
        const password = credentials?.password?.toString() ?? "";
        if (!email || !password) return null;

        const headers: Record<string, string> = {
          "content-type": "application/json"
        };

        if (INTERNAL_API_KEY && hasStrongInternalKey(INTERNAL_API_KEY)) {
          headers["x-internal-api-key"] = INTERNAL_API_KEY;
        }

        const response = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email, password }),
          cache: "no-store"
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as {
          user?: { id: string; email: string; displayName?: string | null };
        };

        if (!payload.user?.id || !payload.user.email) {
          return null;
        }

        return {
          id: payload.user.id,
          email: payload.user.email,
          name: payload.user.displayName ?? payload.user.email.split("@")[0]
        };
      }
    })
  ];

  const googleClientId = process.env.GOOGLE_CLIENT_ID || runtime.googleClientId;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || runtime.googleClientSecret;
  if (googleClientId && googleClientSecret) {
    providers.push(
      GoogleProvider({
        clientId: googleClientId,
        clientSecret: googleClientSecret
      })
    );
  }

  const appleClientId = process.env.APPLE_CLIENT_ID || runtime.appleClientId;
  const appleClientSecret = process.env.APPLE_CLIENT_SECRET || runtime.appleClientSecret;
  if (appleClientId && appleClientSecret) {
    providers.push(
      AppleProvider({
        clientId: appleClientId,
        clientSecret: appleClientSecret
      })
    );
  }

  return {
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    providers,
    session: {
      strategy: "jwt"
    },
    callbacks: {
      async jwt({ token, account }) {
        if (account) {
          (token as Record<string, unknown>).provider = account.provider;
          (token as Record<string, unknown>).providerAccountId = account.providerAccountId;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.email = token.email;
          (session.user as Record<string, unknown>).provider = (token as Record<string, unknown>).provider;
          (session.user as Record<string, unknown>).providerAccountId = (token as Record<string, unknown>).providerAccountId;
        }
        return session;
      }
    },
    pages: {
      signIn: "/"
    }
  };
}

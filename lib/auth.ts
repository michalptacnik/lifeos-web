import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type RuntimeOAuthConfig = {
  googleClientId?: string;
  googleClientSecret?: string;
  appleClientId?: string;
  appleClientSecret?: string;
};

const oauthFile = join(process.cwd(), ".oauth.runtime.json");

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
  const providers = [];

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

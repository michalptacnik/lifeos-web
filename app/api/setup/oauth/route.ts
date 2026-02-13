import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getOAuthProviderStatus } from "../../../../lib/auth";

const setupToken = process.env.OAUTH_SETUP_TOKEN;
const oauthFile = join(process.cwd(), ".oauth.runtime.json");

export async function GET() {
  const providers = getOAuthProviderStatus();
  return NextResponse.json({ providers });
}

export async function POST(request: NextRequest) {
  if (!setupToken) {
    return NextResponse.json({ message: "Server missing OAUTH_SETUP_TOKEN" }, { status: 500 });
  }

  const body = (await request.json()) as {
    setupToken?: string;
    googleClientId?: string;
    googleClientSecret?: string;
    appleClientId?: string;
    appleClientSecret?: string;
  };

  if (!body.setupToken || body.setupToken !== setupToken) {
    return NextResponse.json({ message: "Invalid setup token" }, { status: 401 });
  }

  const payload = {
    googleClientId: body.googleClientId?.trim() || "",
    googleClientSecret: body.googleClientSecret?.trim() || "",
    appleClientId: body.appleClientId?.trim() || "",
    appleClientSecret: body.appleClientSecret?.trim() || ""
  };

  writeFileSync(oauthFile, JSON.stringify(payload, null, 2), { mode: 0o600 });

  return NextResponse.json({ message: "OAuth credentials saved", providers: getOAuthProviderStatus() });
}

import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  CLIENT_COOKIE,
  createAuthToken,
  newClientId,
  passwordMatches,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = await createAuthToken();
  const res = NextResponse.json({ ok: true });

  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  // Ensure a stable client identity for seat claiming.
  if (!req.cookies.get(CLIENT_COOKIE)?.value) {
    res.cookies.set(CLIENT_COOKIE, newClientId(), {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return res;
}

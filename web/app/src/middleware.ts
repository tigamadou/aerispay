import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { authRateLimiter } from "@/lib/rate-limit";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isLogin = nextUrl.pathname === "/login";
  const isApi = nextUrl.pathname.startsWith("/api/");

  // Rate-limit authentication endpoints (POST only)
  if (
    isApi &&
    nextUrl.pathname.startsWith("/api/auth/") &&
    req.method === "POST"
  ) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const { limited, resetAt } = authRateLimiter.check(ip);

    if (limited) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez plus tard." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        },
      );
    }
  }

  if (isApi) {
    return NextResponse.next();
  }

  if (!isLoggedIn && !isLogin) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (isLoggedIn && isLogin) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

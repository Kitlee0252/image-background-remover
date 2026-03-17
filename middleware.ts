import { auth } from "./auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Let Auth.js routes pass through (sign-in, callback, etc.)
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // All other /api/* routes require authentication
  if (!req.auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/api/:path*"],
};

import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Checagem otimista (só olha o cookie, não bate no banco — o proxy roda em Edge
// e o driver do SQLite é nativo, não pode rodar aqui). A checagem de role acontece
// nas páginas/layouts do servidor via auth.api.getSession.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};

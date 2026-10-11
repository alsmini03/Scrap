import authConfig from "./auth.config";
import NextAuth from "next-auth";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/((?!api/init|api/extract|api/proxy-image|api/blog/extract|api/blog/list|api/report|api/report/content|api/report/download|api/report/extract|api/youtube/extract|api/youtube/recommend|api/migrate|login|_next/static|_next/image|favicon.ico).*)",
  ],
};

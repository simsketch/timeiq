// Clerk keeps a readable __client_uat cookie that is "0" when signed out and a timestamp when
// signed in. Public pages read it to pick their links without downloading Clerk. Other Clerk
// instances (dev, an old key) leave their own suffixed copies, so read only this instance's,
// falling back to the plain cookie the way Clerk does.
export function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  const jar = new Map(document.cookie.split("; ").map((c) => c.split("=") as [string, string]));
  const value = jar.get(`__client_uat_${process.env.NEXT_PUBLIC_CLERK_COOKIE_SUFFIX}`) ?? jar.get("__client_uat");
  return !!value && value !== "0";
}

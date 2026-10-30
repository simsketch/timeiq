// Clerk keeps a readable __client_uat cookie (sometimes with a suffix) that is
// "0" when signed out and a timestamp when signed in. Public pages read it to
// pick their links without downloading Clerk.
export function hasSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => {
    const [name, value] = c.split("=");
    return name.startsWith("__client_uat") && !!value && value !== "0";
  });
}

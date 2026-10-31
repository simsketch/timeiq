// Private links carry bearer tokens: anyone holding the URL can open the
// invoice, answer the invite or cancel the booking. Third-party analytics
// record the full page URL, so those pages must never reach them.

// Pages opened from a private link (the token is in the path or the query).
const PRIVATE_PATHS = [/^\/invoice\//, /^\/meet\//, /^\/bookings\//, /^\/imports\/undo/, /^\/email-addresses\/confirm/];
// Query parameters that carry a credential, or a URL that does (sign-in's
// redirect_url back to an invite). Billing's session_id isn't one of them:
// those pages report the purchase, and GA and Vercel get it redacted.
const PRIVATE_PARAMS = ["token", "redirect_url"];
// Attribution parameters worth keeping in a redacted URL.
const KEPT_PARAMS = /^(utm_\w+|gclid|fbclid|ref)$/;

export function carriesCredentials(url: URL): boolean {
  return (
    PRIVATE_PATHS.some((p) => p.test(url.pathname)) ||
    PRIVATE_PARAMS.some((k) => url.searchParams.has(k))
  );
}

/** The URL with private path segments replaced and only attribution query kept. */
export function redactUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  url.pathname = url.pathname
    .replace(/^\/invoice\/[^/]+/, "/invoice/[token]")
    .replace(/^\/meet\/[^/]+/, "/meet/[token]");
  const kept = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (KEPT_PARAMS.test(key)) kept.append(key, value);
  });
  url.search = kept.toString();
  url.hash = "";
  return url.toString();
}

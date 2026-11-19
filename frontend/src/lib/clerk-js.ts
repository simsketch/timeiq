// shortcut: pinned by hand so the browser skips Clerk's uncached @5 redirect and the sign-in
// page can preload its chunks; bump CLERK_JS_VERSION and CLERK_CHUNK_HASH together when upgrading
// (read them from the chunk names on clerk.timeiq.app/npm/@clerk/clerk-js@<version>/dist/).
export const CLERK_JS_VERSION = "5.128.3";
const CLERK_CHUNK_HASH = "7f6f7c";

// The publishable key is "pk_<env>_" + base64("<frontend api host>$").
const host = atob((process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "pk_x_").split("_")[2] ?? "").replace(/\$$/, "");
const base = `https://${host}/npm/@clerk/clerk-js@${CLERK_JS_VERSION}/dist`;

/** The chunks Clerk's sign-in and sign-up forms load after its main script runs. */
export const CLERK_UI_CHUNKS = !host ? [] : ["framework", "vendors", "ui-common"].map(
  (name) => `${base}/${name}_clerk.browser_${CLERK_CHUNK_HASH}_${CLERK_JS_VERSION}.js`
);

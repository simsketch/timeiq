# TimeIQ - Project Instructions

## Workflow
- Always commit and push after making changes so they auto-deploy to Vercel
- After pushing, check CI as well as the Vercel deploy: Vercel doesn't run lint, so a green deploy can hide a red CI

## Page speed comes first
- Page load speed beats visual flair. Decorative effects (three.js scenes, animations, large images, third-party scripts) must never block or delay the page's content from rendering or becoming usable.
- The real content (text, links, forms) renders first and is the LCP element. Load frills after first paint (idle callback or the load event, dynamic import with `ssr: false`), and keep them out of the initial JS bundle.
- Every frill needs a fast, graceful fallback (no WebGL, failure, slow load, reduced motion) and must pause when hidden or offscreen.
- Measure with mobile Lighthouse on a production build (`npm run build && npm run start`, never the dev server) before and after any visual change, and don't ship a meaningful regression.

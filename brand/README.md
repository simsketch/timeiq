# TimeIQ brand kit

## The mark

A ring with a notch at 4:30 and a tangerine full stop. It reads three ways at once:

- **Q**, the last letter of the name, so the wordmark is `timeiQ.`
- **a speech bubble**, because you can just tell TimeIQ what to schedule
- **a full stop**, because once you've said it, it's settled: "Say it. It's scheduled."

All geometry comes from `build.py` (plain paths, no masks or fonts). Change it there and run
`python3 brand/build.py`; it rewrites `logo/`, `png/`, the site favicon and touch icons, and the app icons.
The React component (`frontend/src/components/logo.tsx`) carries the same two paths.

## Files

| File | Use |
|---|---|
| `logo/timeiq-mark-on-dark.svg` / `-on-light.svg` | The mark alone, cream or graphite ring |
| `logo/timeiq-mark-tangerine.svg` | Tangerine ring, graphite full stop (loud placements) |
| `logo/timeiq-mark-mono-black.svg` / `-mono-white.svg` | One colour, for print and embossing |
| `logo/timeiq-app-icon*.svg` | Full-bleed square icons (graphite, cream, tangerine) |
| `logo/timeiq-favicon.svg` | Rounded tile with the mark enlarged to survive 16 px |
| `logo/timeiq-wordmark-on-light.svg` / `-on-dark.svg` | `timeiQ.` in Geist Bold, outlined |
| `png/` | 1024 app icon, 180 touch icon, 32/192/512 favicons, 1024 marks, 4x wordmarks |

## Colour

| Name | Hex | Use |
|---|---|---|
| Graphite | `#141414` | Ink, dark grounds, the icon tile |
| Cream | `#F4EFE3` | The mark on dark, warm light grounds |
| Tangerine | `#F2690D` | The full stop and one accent per view; never body text on white |
| Tangerine ink | `#C2410C` | Tangerine text and links on white (passes contrast) |
| Stone | `#71717A` | Secondary text |

White and neutral greys carry everything else. No purple, violet or blue.

## Type

**Geist** for everything: Geist Bold or ExtraBold for headlines (tight tracking, about -0.03em), Geist
Regular for body, **Geist Mono** for numbers, times and labels. Instrument Serif survives only as an
italic accent in a few landing headlines.

## Rules

- The full stop is always tangerine, except in the one-colour versions.
- Keep clear space around the mark equal to the full stop's diameter.
- Never rotate the mark, outline it, add effects, or put the ring in tangerine on a tangerine ground.
- The name in running text is **TimeIQ**. The lowercase `timeiQ.` is the logo, not a spelling.
- Minimum size: 16 px for the favicon tile, 20 px for the bare mark.

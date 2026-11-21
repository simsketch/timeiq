#!/bin/zsh
# usage: make.sh <shot-id>  — renders raw/<id>.png with Codex's image tool from shots.tsv
# inputs: style-ref.png (KidCash layout to match), captures/<id>.png (real screen), wordmark.png
cd "${0:A:h}"
IFS=$'\t' read -r id cap tag head word sub props < <(grep "^$1	" shots.tsv)
[[ -n $id ]] || { echo "no shot $1"; exit 1; }
cat > logs/$id.prompt <<P
Create one tall iPhone App Store screenshot, portrait, aspect ratio exactly 1320:2868.

Image 1 is a LAYOUT AND STYLE REFERENCE from a different app. Copy its composition and polish only: logo top-left, a small rounded tag pill, a huge bold sans-serif headline where one word is in a handwritten script on a painted brush stroke, a short subtitle, an outlined App Store pill, a tilted realistic iPhone 17 Pro Max in the lower two thirds, floating UI cards overlapping the phone edge with a short handwritten arrow note, soft realistic shadows and depth. Do not copy its colors, logo, text or screen.

Image 2 is the REAL app screen. Place it inside the phone exactly as given: same layout, text, numbers and colors. Do not redraw, invent or translate any UI.

Image 3 is the TimeIQ wordmark. Use it as the logo in the top-left, pixel-for-pixel unchanged: it reads "timeiQ." with a CAPITAL Q and a tangerine dot. Cream on the dark background.

Brand: background is a deep graphite gradient (#141414 to #2A2622) with a subtle warm tangerine glow behind the phone. Headline and subtitle in warm cream #F4EFE3. The single accent color is tangerine #F2690D: use it for the brush stroke under the script word and for small accents. No blue, purple or violet anywhere.

Text, spelled exactly:
- Tag pill (tangerine fill, graphite text, uppercase): "$tag"
- Headline: "$head" followed by the word "$word" in tangerine-underlined handwritten script on the brush stroke
- Subtitle: "$sub"
- App Store pill: Apple logo, "APP STORE" over "PRODUCTIVITY"

Props: $props. Any text on props must be spelled correctly and stay short. No other text, no watermarks, no extra logos.

Save the final image file as ./raw/$id.png and print the path. Create no other files.
P
timeout 900 codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -C . \
  -i style-ref.png -i captures/$cap.png -i wordmark.png - < logs/$id.prompt > logs/$id.log 2>&1
[[ -f raw/$id.png ]] && echo "ok $id $(sips -g pixelWidth -g pixelHeight raw/$id.png | tail -2 | tr -d '\n')" || { echo "FAIL $id"; tail -5 logs/$id.log; }

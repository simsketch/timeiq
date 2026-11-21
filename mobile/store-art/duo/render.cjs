// Render the TimeIQ iPhone Duo App Store screenshots (APP_IPHONE_DUO) from duo.html, then stamp the lockup.
// Adapted from kidcash/store-screenshots/tools/render-store.cjs.
//
//   python3 mobile/store-art/duo/duo-composite.py                      (frames captures-duo/ -> duo/framed/)
//   npm i --prefix /tmp/pw playwright@1.48.2                           (once; kept out of the app's deps)
//   python3 -m http.server 8766 --bind 127.0.0.1 -d mobile/store-art   (another shell)
//   NODE_PATH=/tmp/pw/node_modules node mobile/store-art/duo/render.cjs
// Writes mobile/fastlane/screenshots/en-US/duo-0N-<name>.png. Needs ImageMagick (magick) for the lockup.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');

const ART = path.join(__dirname, '..');
const OUT = path.join(ART, '..', 'fastlane', 'screenshots', 'en-US');
const BASE = 'http://127.0.0.1:8766/duo/duo.html';
// [file name, shots.tsv id, posture, framed device]; landscape 2853x2007, laptop 2007x2853 (App Store Connect Duo sizes).
const SHOTS = [
  ['duo-01-calendars', '01_calendars', 'land', 'land-01_agenda'],
  ['duo-02-chat', '02_chat', 'laptop', 'laptop-02_assistant'],
  ['duo-03-import', '06_import', 'land', 'land-06_import'],
  ['duo-04-agent', '03_agent', 'land', 'land-04_calendars'],
  ['duo-05-share', '04_share', 'book', 'book-03_availability'],
  ['duo-06-paid', '05_paid', 'land', 'land-05_event_types'],
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const [name, id, kind, dev] of SHOTS) {
    const [w, h] = kind === 'laptop' ? [2007, 2853] : [2853, 2007];
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}?id=${id}&kind=${kind}&dev=${dev}`);
    await page.waitForSelector('body[data-ready="1"]', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(200);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    await page.close();
    // Lockup at the iPhone set's spot and size (make.sh), measured on the canvas's short side.
    const s = Math.min(w, h), lh = Math.round(s * 0.076), x = Math.round(s * 0.061), y = Math.round(s * 0.05);
    execFileSync('magick', [file, '(', path.join(ART, 'lockup.png'), '-resize', `x${lh}`, ')', '-geometry', `+${x}+${y}`, '-composite', file]);
    console.log('ok', file);
  }
  await browser.close();
})();

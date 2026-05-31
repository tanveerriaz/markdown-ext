## Learned User Preferences
- Follow provided specs literally and preserve exact command/text requirements when the user supplies them.
- Continue execution to completion without pausing once implementation is underway.
- Push completed work directly to `main` when asked, instead of stopping at local changes.
- Use the purple-to-green gradient (#7c3aed → #22c55e, 135deg) for the extension "M" icon and setup screenshots — not for the landing page hero.
- Apply the Manuscript editorial landing design (cream/ink, Newsreader, terracotta #B4502E) from My Tools.zip for site UI — not muted-teal or a gradient hero.
- Prefer real install screenshots over HTML mocks in setup documentation.
- Keep Chrome and Firefox setup documentation separate on the landing page for clarity.
- Keep setup screenshots and install assets consistent across the landing page and `docs/SETUP.md`.
- When the user says **my tagline**, use exactly: `Curious mind. Builder mode! 🇸🇬` (exclamation mark and 🇸🇬 flag included).

## Learned Workspace Facts
- The workspace repo is connected to `https://github.com/tanveerriaz/markdown-ext.git`.
- The project deploy target is Cloudflare Pages with project name `markdown-ext`.
- The live site URL is `https://markdown-ext.pages.dev/`.
- The deploy zip contains a `chrome-extension/` folder and `firefox-extension.xpi` (plus `START-HERE.txt`).
- Chrome · Edge · Brave share one Chromium extension package (`chrome-extension/`) — a marketing label, not separate builds.
- Firefox install uses `about:debugging` → Load Temporary Add-on → `chrome-extension/manifest.json` with the file picker set to All Files; not `about:addons`.
- Landing images are optimized via `landing/scripts/optimize-landing-images.mjs` (setup 720px, showcase 1080px) in the deploy workflow.
- Tool landing pages follow the Manuscript template from My Tools.zip with brand line "Curious mind. Builder mode! 🇸🇬" by Tanveer Riaz, deployed on Cloudflare Pages.

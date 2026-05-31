# Markdown Convert

Convert any webpage into **clean, agent-ready Markdown** in one click. Built as a Chrome / Firefox extension with no account, no backend, and no build step.

- **Live site:** [markdown-ext.pages.dev](https://markdown-ext.pages.dev/)
- **Setup guide (with screenshots):** [docs/SETUP.md](docs/SETUP.md)

## Features

- Extracts main content using [Mozilla Readability](https://github.com/mozilla/readability), plus visible regions, tables, form fields, open shadow DOM, and same-origin embeds when they add value
- Lists cross-origin embeds (e.g. YouTube players) with links and labels — inner frame content cannot be read by the browser
- Strips navigation, cookie banners, chat widgets, and tracking noise (generic rules, no per-site config)
- Outputs **YAML frontmatter** (`title`, `url`, `page_type`, `extracted_at`, optional `sources`) for LLM / agent workflows
- Copy to clipboard or download as `.md`

## Quick start

1. Download **`markdown-ext.zip`** from [markdown-ext.pages.dev](https://markdown-ext.pages.dev/)
2. Unzip — you get **`chrome-extension/`** (Chrome) and **`firefox-extension.xpi`** (Firefox)
3. **Chrome / Edge:** `chrome://extensions` → Developer mode → **Load unpacked** → select `chrome-extension/`
4. **Firefox:** `about:debugging` only (not `about:addons`) → **Load Temporary Add-on** → `chrome-extension/manifest.json` (picker: *All Files*)
5. Open any page, click the extension icon, then **Convert**

Full illustrated steps (Chrome + Firefox): **[docs/SETUP.md](docs/SETUP.md)**

## Project structure

```
extension/          # Browser extension (load this folder)
  manifest.json
  content.js          # Layered extraction (Readability + augment + multi-frame)
  popup.js            # Turndown + agent markdown pass
  readability.min.js
  turndown.min.js
landing/              # Cloudflare Pages site + zip artifact
docs/
  SETUP.md            # Installation guide with screenshots
  screenshots/        # Images for README and landing page
```

## Development

No bundler required. Edit files in `extension/` and reload the extension at `chrome://extensions`.

Deploy the landing page (and rebuild the zip) by pushing to `main` — see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/SETUP.md](docs/SETUP.md) | Step-by-step install with screenshots |
| [docs/mocks/](docs/mocks/) | HTML mocks used to produce setup artwork |

Screenshots are also shown on the [landing page setup section](https://markdown-ext.pages.dev/#setup-heading).

## Third-party

- [Mozilla Readability](https://github.com/mozilla/readability) (Apache-2.0)
- [Turndown](https://github.com/mixmark-io/turndown) (MIT)

## Trademarks

Google Chrome and the Chrome logo are trademarks of Google LLC. Firefox and the Firefox logo are trademarks of the Mozilla Foundation. They appear on the landing page only to indicate browser compatibility. This project is not endorsed by Google or Mozilla.

Full attribution and logo sources: **[TRADEMARKS.md](TRADEMARKS.md)**

## Author

**Tanveer Riaz** — [GitHub](https://github.com/tanveerriaz/markdown-ext)

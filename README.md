# Markdown Convert

Convert any webpage into **clean, agent-ready Markdown** in one click. Built as a Chrome / Firefox extension with no account, no backend, and no build step.

- **Live site:** [markdown-ext.pages.dev](https://markdown-ext.pages.dev/)
- **Setup guide (with screenshots):** [docs/SETUP.md](docs/SETUP.md)

## Features

- Extracts main content from any site using [Mozilla Readability](https://github.com/mozilla/readability)
- Strips navigation, cookie banners, chat widgets, and tracking noise (generic rules, no per-site config)
- Outputs **YAML frontmatter** (`title`, `url`, `page_type`, `extracted_at`) for LLM / agent workflows
- Copy to clipboard or download as `.md`

## Quick start

1. Download **`markdown-ext.zip`** from [markdown-ext.pages.dev](https://markdown-ext.pages.dev/)
2. Unzip — you get **`markdown-ext/extension/`** (Chrome) and **`markdown-ext.xpi`** (Firefox)
3. **Chrome / Edge:** `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`
4. **Firefox:** `about:debugging` only (not `about:addons`) → **Load Temporary Add-on** → `extension/manifest.json` (picker: *All Files*)
5. Open any page, click the extension icon, then **Convert**

Full illustrated steps (Chrome + Firefox): **[docs/SETUP.md](docs/SETUP.md)**

## Project structure

```
extension/          # Browser extension (load this folder)
  manifest.json
  content.js          # Readability extraction + cleanup
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

## Author

**Tanveer Riaz** — [GitHub](https://github.com/tanveerriaz/markdown-ext)

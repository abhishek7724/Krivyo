# Krivyo — marketing site

Static site for [Krivyo](https://krivyo.com), the Chrome side-panel extension that records browser
workflows and generates reviewable process guides.

No build step, no dependencies. Plain HTML, CSS and one small JS file.

```
krivyo-site/
├── index.html      landing page
├── privacy.html    privacy policy (mirrors the extension's policy)
├── styles.css      all styling + design tokens
├── script.js       hero capture animation + scroll reveals
└── assets/
    ├── krivyo-mark.png   logo (from the extension's icon128)
    ├── favicon.png       favicon (icon48)
    └── india-flag.svg    footer flag
```

## Design tokens

Every colour is taken from the extension source, so the site and the product match exactly.

| Token | Hex | Where it comes from |
|---|---|---|
| `--forest` | `#1A4B44` | primary button in `sidebar.css` |
| `--forest-dark` | `#143D38` | primary button hover |
| `--forest-deep` | `#172B27` | headings, footer, privacy band |
| `--forest-mid` | `#19584F` | eyebrows, secondary text |
| `--mint` / `--mint-soft` | `#EAF3F1` / `#F4F9F8` | tinted surfaces |
| `--edge` | `#C9DDD9` | hairlines on tinted areas |
| `--signal` | `#C94A4A` | **the highlight ring** — `HIGHLIGHT_COLOR` in `content/highlightOverlay.js` |
| `--ink` / `--muted` | `#202124` / `#667085` | body text |

The red ring is the site's signature device: same colour, same `3.5px` border, same `13px` radius
and same `rgba(201,74,74,0.30)` glow the extension draws on every element you touch. It appears
in the hero animation and under the word "everything" in the headline.

Type: **Archivo** (display) · **Inter** (body, same as the extension) · **IBM Plex Mono** (labels, step
codes, filenames).

## Deploy to GitHub Pages

1. Create a repo and push these files to the root of the `main` branch:

   ```bash
   cd krivyo-site
   git init
   git add .
   git commit -m "Krivyo site"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. In the repo: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: `/ (root)` → **Save**

3. Live in a minute or two at `https://<you>.github.io/<repo>/`.

### Custom domain (krivyo.com)

1. Add a file named `CNAME` in the repo root containing one line: `krivyo.com`
2. At your DNS provider, add four `A` records for the apex pointing at
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`,
   plus a `CNAME` for `www` → `<you>.github.io`.
3. Back in **Settings → Pages**, enter the domain and tick **Enforce HTTPS** once the
   certificate is issued.

## Before going live

- [ ] Point both "Add to Chrome" buttons at the real Chrome Web Store URL (currently `#`)
- [ ] Add a real support email to `privacy.html` §10, or link the store listing
- [ ] Add an `og:image` (1200×630) and drop it in `assets/`
- [ ] Re-check the privacy copy against the shipped extension version before each release

## Accessibility notes

Skip link, visible keyboard focus (uses the ring colour), semantic landmarks, and
`prefers-reduced-motion` respected — the hero settles to its finished state instead of looping.
Reveal animations are scoped to `.js`, so nothing is invisible if scripts fail to load.

# Krivyo Workspace v0.1

Standalone, dependency-free workspace shell for GitHub Pages.

## Production URL

Place this entire folder at `/workspace` in the existing Krivyo website repository.
After GitHub Pages deploys it will be available at:

`https://krivyo.com/workspace/`

The current demo uses the real Krivyo capture `CAP-20260808-053754-10CFD7` and its generated `guide-model.json` + `ai-process-model.json`.

## What is implemented

- Premium Krivyo-branded full-width app workspace
- Process Guide tab
  - exactly 1 AI guide step per recorded source step
  - original source-step traceability
  - local edit / restore interaction
  - privacy-safe screenshot placeholder when screenshots are not shared
- Test Script tab
  - proper test-step table generated from the current AI process model
  - precondition, test data, expected-result basis, evidence and confidence
  - working CSV export
- Recording tab
  - deterministic source timeline
  - artifact/storage status
- Details tab
  - capture + AI provenance
  - privacy state
  - storage structure
- Command palette (`Ctrl/Cmd + K`)
- Responsive desktop/tablet/mobile layout
- No frameworks, build tools or external JavaScript dependencies

## Deliberately NOT connected yet

- Supabase live fetch/authentication
- user login/workspace tenancy
- persistent edits
- screenshot fetch
- enhanced PDF generation
- extension redirect after Complete Review / first PDF

Those should be connected after the workspace UI/design is approved.

## Local preview

From the repo root:

```bash
python -m http.server 8080
```

Then open:

`http://localhost:8080/workspace/`

## Files

- `index.html`
- `workspace.css`
- `workspace.js`
- `assets/krivyo-mark.svg`
- `assets/favicon.svg`
- `data/process-model.json`
- `data/raw-session.json`
- `data/guide-model.json`
- `data/ai-process-model.json`

## Next connection

Once approved, replace the demo JSON adapter with an authenticated Krivyo backend endpoint so a URL can resolve a capture, e.g.:

`https://krivyo.com/workspace/?capture=CAP-...`

The browser must never receive `OPENAI_API_KEY`, Supabase service-role keys, or `KRIVYO_AI_INTERNAL_TOKEN`.

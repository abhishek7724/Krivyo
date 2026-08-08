# Krivyo Workspace v0.3

Secure live capture loading.

- Removed `/workspace/data/*.json` from the public GitHub Pages site.
- Loads captures from the `workspace-data` Supabase Edge Function.
- Secure links use `?capture=...#access=...`.
- Browser receives process-model, guide-model and ai-process-model only after token verification.
- Full raw-session.json is not returned; only presence/event count is returned.
- No private API/service-role/OpenAI/internal token is present in browser JavaScript.

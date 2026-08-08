# Krivyo Workspace v0.2

Product workspace for `https://krivyo.com/workspace/`.

## Included
- Krivyo website palette and typography.
- Shared root assets (`../assets/`) — no duplicate workspace assets.
- Home, Guides, Test Cases, Knowledge, Analytics and Settings navigation.
- Contextual Krivyo AI rail.
- Real sample capture data for UI validation.
- Guide wording editor with 1:1 recorder-step sequencing.
- Test Script table with CSV export.
- Query-string ready for future extension handoff: `?capture=CAP-...&view=guides`.

## Current mode
The workspace intentionally loads `/workspace/data/*.json` locally so the product experience can be approved before secure live Supabase connectivity is added.

No OpenAI key, Supabase service-role key, or Krivyo internal AI token is exposed in browser code.

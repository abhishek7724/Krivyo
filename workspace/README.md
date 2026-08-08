# Krivyo Workspace v0.5 — Capture-first authenticated workspace

This patch completes the Workspace side of Krivyo Chrome Extension v0.3.0.

## Added

- Existing Supabase email/password authentication remains required.
- `extension-login.html` bridges Chrome Identity sign-in to the existing Krivyo login.
- A signed-in web session can hand its access/refresh session back to the Krivyo extension.
- Workspace capture URLs no longer require temporary `#access=` links.
- Capture ownership is validated by the authenticated user through `workspace-data` v2.
- New **Source Capture** view renders every recorded source step.
- Private screenshots are loaded through one-hour signed Storage URLs only after ownership validation.
- Guide view uses the corresponding source screenshot while keeping AI wording 1:1 with source steps.
- Test/UAT view continues using `ai-process-model.json`, where business grouping is allowed.
- AI generation status is polled after a newly saved capture opens.
- Workspace Home now lists the signed-in user's recent captures.

## Do not overwrite your live config

This release is intended to be copied over the existing `/workspace/` folder **without replacing `workspace-config.js`**.

Your existing `workspace-config.js` already contains your real Supabase publishable browser key. Keep it.

The companion patch ZIP intentionally excludes `workspace-config.js`.

## Backend required

- Run `workspace-foundation.sql`.
- Deploy `capture-sync`.
- Replace `workspace-data` with v2.
- Keep existing `enhance-guide` and `enhance-process` deployed.

## URL

A completed extension capture opens:

`https://krivyo.com/workspace/?capture=<uuid>&view=recording`

The logged-in session determines whether the user may load that UUID.

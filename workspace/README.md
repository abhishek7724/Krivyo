# Krivyo Workspace v0.4 — Supabase Auth

This version adds the first production authentication layer.

## Added

- `/workspace/login.html`
- Email + password sign in
- Create account
- Email confirmation redirect
- Forgot password
- Password recovery / update
- Persistent Supabase Auth session
- Workspace authentication guard
- Dynamic signed-in user name/email
- Sign out
- Existing secure capture URL is preserved through login using `sessionStorage`

## Transitional architecture

Authentication is now required to enter the Workspace.

For this milestone, capture loading still uses the existing temporary signed capture token:

`?capture=CAP-...&view=guides#access=...`

After login, the user is returned to that exact URL.

Next milestone:
`captures` table + `user_id` ownership + RLS, then remove `#access=` from normal product URLs.

## Required local configuration before pushing

Open:

`workspace/workspace-config.js`

Replace:

`PASTE_SUPABASE_PUBLISHABLE_KEY_HERE`

with your Supabase **publishable** browser key (`sb_publishable_...`).

Do not use a secret key or service-role key.

The project URL is already configured.

## Supabase Auth dashboard

These should already be configured:

Site URL:
`https://krivyo.com/workspace/`

Redirect URLs:
- `https://krivyo.com/workspace/`
- `https://krivyo.com/workspace/**`

Email provider:
- enabled
- signups enabled
- email confirmation enabled

## URLs

Login:
`https://krivyo.com/workspace/login.html`

Workspace:
`https://krivyo.com/workspace/`

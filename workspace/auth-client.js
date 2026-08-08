import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const RETURN_TO_KEY = "krivyo.auth.returnTo";
let client = null;

function config() {
  return window.KRIVYO_WORKSPACE_CONFIG || {};
}

function assertConfigured() {
  const cfg = config();
  if (!cfg.supabaseUrl) {
    throw new Error("Supabase Auth URL is not configured.");
  }
  if (
    !cfg.supabasePublishableKey ||
    cfg.supabasePublishableKey.includes("PASTE_SUPABASE_PUBLISHABLE_KEY_HERE")
  ) {
    throw new Error(
      "Supabase publishable key is not configured in workspace-config.js."
    );
  }
  return cfg;
}

export function getSupabaseClient() {
  if (client) return client;

  const cfg = assertConfigured();
  client = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return client;
}

export function rememberReturnTo(url = window.location.href) {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, url);
  } catch {}
}

export function consumeReturnTo() {
  try {
    const value = sessionStorage.getItem(RETURN_TO_KEY);
    if (value) sessionStorage.removeItem(RETURN_TO_KEY);
    return value || null;
  } catch {
    return null;
  }
}

export function peekReturnTo() {
  try {
    return sessionStorage.getItem(RETURN_TO_KEY);
  } catch {
    return null;
  }
}

export async function getAuthenticatedUser() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.warn("Krivyo auth user lookup failed:", error.message);
    return null;
  }

  return data?.user || null;
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedUser();
  if (user) return user;

  rememberReturnTo(window.location.href);
  window.location.replace("/workspace/login.html");
  return null;
}

export async function signOutUser() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  try {
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {}

  window.location.replace("/workspace/login.html?signedout=1");
}

export function userDisplayName(user) {
  const metadata = user?.user_metadata || {};
  const fullName =
    metadata.full_name ||
    metadata.name ||
    metadata.display_name ||
    "";

  if (String(fullName).trim()) return String(fullName).trim();

  const email = String(user?.email || "");
  return email.includes("@") ? email.split("@")[0] : "Krivyo User";
}

export function userInitial(user) {
  const name = userDisplayName(user).trim();
  return (name[0] || "K").toUpperCase();
}

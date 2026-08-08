import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const RETURN_TO_KEY = "krivyo.auth.returnTo";
const EXTENSION_ID_KEY = "krivyo.extension.id";
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

function rememberedExtensionId() {
  try {
    const value = localStorage.getItem(EXTENSION_ID_KEY);
    return /^[a-z0-9]{32}$/i.test(String(value || "")) ? value : null;
  } catch {
    return null;
  }
}

async function notifyConnectedExtensionSignedOut() {
  const extensionId = rememberedExtensionId();

  if (!extensionId || !window.chrome?.runtime?.sendMessage) {
    return false;
  }

  try {
    const result = await chrome.runtime.sendMessage(extensionId, {
      type: "KRIVYO_AUTH_SIGNED_OUT"
    });

    return result?.success === true;
  } catch (error) {
    console.debug("Krivyo extension sign-out sync unavailable:", error);
    return false;
  }
}

export async function signOutUser() {
  const supabase = getSupabaseClient();

  /*
   * Website and extension are one Krivyo account experience.
   * Tell the installed extension to clear its local auth immediately, then
   * globally revoke the Supabase session/refresh tokens.
   */
  await notifyConnectedExtensionSignedOut();

  let signOutError = null;

  try {
    const { error } = await supabase.auth.signOut({ scope: "global" });
    signOutError = error || null;
  } catch (error) {
    signOutError = error;
  }

  /*
   * Even if the remote/global call is temporarily unavailable, always clear
   * this website's local Supabase session so the UI actually signs out.
   */
  if (signOutError) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {}
  }

  // Retry after the global revoke in case the first message raced the page.
  await notifyConnectedExtensionSignedOut();

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

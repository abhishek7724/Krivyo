import {
  getSupabaseClient,
  getAuthenticatedUser,
  consumeReturnTo
} from "./auth-client.js";

const $ = (selector) => document.querySelector(selector);
const supabase = getSupabaseClient();

const state = {
  mode: "signin",
  recovery: false
};

const EXTENSION_REDIRECT_KEY = "krivyo.extension.redirect";
const EXTENSION_ID_KEY = "krivyo.extension.id";

function rememberExtensionIdFromRedirect(redirect) {
  const extensionId = extensionIdFromRedirect(redirect);

  if (!extensionId) return null;

  try {
    localStorage.setItem(EXTENSION_ID_KEY, extensionId);
  } catch {}

  return extensionId;
}

function rememberedExtensionId() {
  try {
    const value = localStorage.getItem(EXTENSION_ID_KEY);
    return /^[a-z0-9]{32}$/i.test(String(value || "")) ? value : null;
  } catch {
    return null;
  }
}

function extensionRedirect() {
  try {
    const fromUrl = new URLSearchParams(location.search).get("ext_redirect");
    if (fromUrl && /^https:\/\/[a-z0-9]+\.chromiumapp\.org\//i.test(fromUrl)) {
      sessionStorage.setItem(EXTENSION_REDIRECT_KEY, fromUrl);
      rememberExtensionIdFromRedirect(fromUrl);
      return fromUrl;
    }

    const stored = sessionStorage.getItem(EXTENSION_REDIRECT_KEY) || null;
    if (stored) rememberExtensionIdFromRedirect(stored);
    return stored;
  } catch {
    return null;
  }
}

function extensionIdFromRedirect(redirect) {
  try {
    const host = new URL(redirect).hostname;
    const match = host.match(/^([a-z0-9]+)\.chromiumapp\.org$/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function notifyExtensionDirectly(session) {
  const redirect = extensionRedirect();
  const extensionId =
    extensionIdFromRedirect(redirect) || rememberedExtensionId();

  if (!extensionId || !window.chrome?.runtime?.sendMessage || !session) {
    return false;
  }

  try {
    const result = await chrome.runtime.sendMessage(extensionId, {
      type: "KRIVYO_AUTH_SESSION",
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in || 3600
    });

    if (result?.success === true) {
      try {
        localStorage.setItem(EXTENSION_ID_KEY, extensionId);
      } catch {}
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function completeExtensionAuthIfRequested() {
  const redirect = extensionRedirect();
  if (!redirect) return false;

  if (!/^https:\/\/[a-z0-9]+\.chromiumapp\.org\//i.test(redirect)) {
    sessionStorage.removeItem(EXTENSION_REDIRECT_KEY);
    return false;
  }

  const { data, error } = await supabase.auth.getSession();
  const session = data?.session;
  if (error || !session?.access_token || !session?.refresh_token) return false;

  await notifyExtensionDirectly(session);
  sessionStorage.removeItem(EXTENSION_REDIRECT_KEY);
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in || 3600)
  });
  window.location.replace(`${redirect}#${fragment.toString()}`);
  return true;
}

function setMessage(message = "", type = "") {
  const box = $("#authMessage");
  box.textContent = message;
  box.className = `auth-message${message ? " show" : ""}${type ? ` ${type}` : ""}`;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  const span = button.querySelector("span");
  if (span) span.textContent = busy ? "Please wait…" : label;
}

function setMode(mode) {
  state.mode = mode;
  const signIn = mode === "signin";
  $("#signInTab").classList.toggle("active", signIn);
  $("#signUpTab").classList.toggle("active", !signIn);
  $("#signInForm").classList.toggle("hidden", !signIn);
  $("#signUpForm").classList.toggle("hidden", signIn);
  $("#authTitle").textContent = signIn
    ? "Sign in to your workspace"
    : "Create your Krivyo account";
  $("#authSubtitle").textContent = signIn
    ? "Continue where your captured process left off."
    : "Start building process knowledge from the work itself.";
  setMessage("");
}

function showResetMode() {
  state.recovery = true;
  $("#standardAuth").classList.add("hidden");
  $("#resetAuth").classList.remove("hidden");
  setMessage("");
}

function showStandardMode() {
  state.recovery = false;
  $("#resetAuth").classList.add("hidden");
  $("#standardAuth").classList.remove("hidden");
  setMode("signin");
}

function destinationAfterAuth() {
  const remembered = consumeReturnTo();
  if (remembered) return remembered;
  return "/workspace/";
}

async function redirectIfAlreadySignedIn() {
  const params = new URLSearchParams(location.search);

  if (params.get("signedout") === "1") {
    setMessage("You have been signed out.", "success");
    return;
  }

  const user = await getAuthenticatedUser();
  if (user && !state.recovery) {
    const { data } = await supabase.auth.getSession();

    if (data?.session) {
      await notifyExtensionDirectly(data.session);
    }

    if (!(await completeExtensionAuthIfRequested())) {
      window.location.replace(destinationAfterAuth());
    }
  }
}

$("#signInTab").addEventListener("click", () => setMode("signin"));
$("#signUpTab").addEventListener("click", () => setMode("signup"));
$("#backToSignIn").addEventListener("click", showStandardMode);

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.textContent = show ? "Hide" : "Show";
  });
});

$("#signInForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const button = $("#signInButton");
  const email = $("#signInEmail").value.trim();
  const password = $("#signInPassword").value;

  setBusy(button, true, "Sign in");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    if (data?.session) {
      await notifyExtensionDirectly(data.session);
    }

    if (!(await completeExtensionAuthIfRequested())) {
      window.location.replace(destinationAfterAuth());
    }
  } catch (error) {
    setMessage(
      error?.message || "Could not sign in. Check your email and password.",
      "error"
    );
  } finally {
    setBusy(button, false, "Sign in");
  }
});

$("#signUpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const button = $("#signUpButton");
  const fullName = $("#signUpName").value.trim();
  const email = $("#signUpEmail").value.trim();
  const password = $("#signUpPassword").value;

  setBusy(button, true, "Create account");

  try {
    const extRedirect = extensionRedirect();
    const redirectTo = extRedirect
      ? `${location.origin}/workspace/login.html?extension=1&ext_redirect=${encodeURIComponent(extRedirect)}`
      : (window.KRIVYO_WORKSPACE_CONFIG?.authRedirectUrl ||
        `${location.origin}/workspace/login.html`);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName
        },
        emailRedirectTo: redirectTo
      }
    });

    if (error) throw error;

    if (data?.session) {
      await notifyExtensionDirectly(data.session);

      if (!(await completeExtensionAuthIfRequested())) {
        window.location.replace(destinationAfterAuth());
      }
      return;
    }

    $("#signInEmail").value = email;
    setMode("signin");
    setMessage(
      `Check ${email} and confirm your email address. After confirmation, return here and sign in.`,
      "success"
    );
  } catch (error) {
    setMessage(error?.message || "Could not create your account.", "error");
  } finally {
    setBusy(button, false, "Create account");
  }
});

$("#forgotPassword").addEventListener("click", async () => {
  const email = $("#signInEmail").value.trim();

  if (!email) {
    setMessage("Enter your email address first, then choose Forgot password.", "error");
    $("#signInEmail").focus();
    return;
  }

  setMessage("");

  try {
    const redirectTo = `${location.origin}/workspace/login.html?mode=reset`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) throw error;

    setMessage(
      `Password reset instructions were sent to ${email}.`,
      "success"
    );
  } catch (error) {
    setMessage(error?.message || "Could not send password reset email.", "error");
  }
});

$("#resetPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const password = $("#newPassword").value;
  const confirmation = $("#confirmPassword").value;

  if (password !== confirmation) {
    setMessage("The two passwords do not match.", "error");
    return;
  }

  const button = $("#resetPasswordButton");
  setBusy(button, true, "Update password");

  try {
    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) throw error;

    setMessage("Password updated successfully. Opening your workspace…", "success");
    setTimeout(() => window.location.replace("/workspace/"), 900);
  } catch (error) {
    setMessage(error?.message || "Could not update your password.", "error");
  } finally {
    setBusy(button, false, "Update password");
  }
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    showResetMode();
    return;
  }

  if (event === "SIGNED_IN" && extensionRedirect()) {
    setTimeout(() => {
      completeExtensionAuthIfRequested().catch(error => {
        console.error("Extension authentication handoff failed:", error);
      });
    }, 0);
  }
});

const params = new URLSearchParams(location.search);
if (params.get("mode") === "reset") {
  showResetMode();
}

await redirectIfAlreadySignedIn();

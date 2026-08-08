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
    window.location.replace(destinationAfterAuth());
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    window.location.replace(destinationAfterAuth());
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
    const redirectTo =
      window.KRIVYO_WORKSPACE_CONFIG?.authRedirectUrl ||
      `${location.origin}/workspace/login.html`;

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
      window.location.replace(destinationAfterAuth());
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
  }
});

const params = new URLSearchParams(location.search);
if (params.get("mode") === "reset") {
  showResetMode();
}

await redirectIfAlreadySignedIn();

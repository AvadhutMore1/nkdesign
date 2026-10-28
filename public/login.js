const accountForm = document.getElementById("account-form");
const nameField = document.getElementById("name-field");
const nameInput = accountForm.elements.namedItem("name");
const emailInput = accountForm.elements.namedItem("email");
const passwordInput = accountForm.elements.namedItem("password");
const errorNode = document.getElementById("account-error");
const submitButton = document.getElementById("account-submit");
const submitLabel = submitButton.querySelector("span");
const signinTab = document.getElementById("signin-tab");
const registerTab = document.getElementById("register-tab");
const loginTitle = document.getElementById("login-title");
const loginIntro = document.getElementById("login-intro");
const passwordHint = document.getElementById("password-hint");
const passwordToggle = document.getElementById("password-toggle");
const loginPanel = document.querySelector(".login-panel");
const storyPanel = document.querySelector(".login-story");
const storyKicker = document.getElementById("login-slide-kicker");
const storyTitle = document.getElementById("login-slide-title");
const storyDescription = document.getElementById("login-slide-description");
const storyCount = document.getElementById("login-slide-count");
const storySlides = Array.from(document.querySelectorAll(".login-slide"));
const storyDots = Array.from(document.querySelectorAll(".login-slide-dot"));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let mode = "signin";
let activeSlide = 0;
let slideTimer;
let slidePaused = false;
const stories = [
  {
    kicker: "THE ART OF DETAIL",
    firstLine: "Elegance in",
    secondLine: "every thread.",
    description: "Discover considered silhouettes, thoughtful details, and handcrafted blouses made for every version of you."
  },
  {
    kicker: "ROOTED IN HERITAGE",
    firstLine: "Tradition,",
    secondLine: "reimagined.",
    description: "A thoughtful celebration of Indian craftsmanship, shaped for the way you love to dress."
  },
  {
    kicker: "MADE AROUND YOU",
    firstLine: "Your style.",
    secondLine: "Your story.",
    description: "Find the details that feel like you, and make every occasion your own."
  }
];

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";
  nameField.hidden = !registering;
  nameInput.required = registering;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  passwordInput.minLength = registering ? 12 : 1;
  passwordHint.textContent = registering
    ? "Choose a password with at least 12 characters."
    : "Use your account password.";
  submitLabel.textContent = registering ? "Create account" : "Sign in";
  loginTitle.textContent = registering ? "Create your account." : "Welcome back.";
  loginIntro.textContent = registering
    ? "Create an account to explore the NK Design collection."
    : "Sign in to continue to your collection.";
  signinTab.classList.toggle("is-selected", !registering);
  signinTab.setAttribute("aria-selected", String(!registering));
  registerTab.classList.toggle("is-selected", registering);
  registerTab.setAttribute("aria-selected", String(registering));
  errorNode.hidden = true;
  loginPanel.classList.remove("is-switching");
  requestAnimationFrame(() => loginPanel.classList.add("is-switching"));
}

function showStory(index) {
  activeSlide = (index + stories.length) % stories.length;
  const story = stories[activeSlide];
  storyKicker.textContent = story.kicker;
  storyTitle.replaceChildren(document.createTextNode(`${story.firstLine} `), document.createElement("br"));
  const emphasized = document.createElement("em");
  emphasized.textContent = story.secondLine;
  storyTitle.append(emphasized);
  storyDescription.textContent = story.description;
  storyCount.innerHTML = `${String(activeSlide + 1).padStart(2, "0")} <i>/</i> ${String(stories.length).padStart(2, "0")}`;
  storySlides.forEach((slide, slideIndex) => slide.classList.toggle("is-active", slideIndex === activeSlide));
  storyDots.forEach((dot, dotIndex) => {
    const selected = dotIndex === activeSlide;
    dot.classList.toggle("is-active", selected);
    dot.setAttribute("aria-current", String(selected));
  });
}

function scheduleStoryRotation() {
  window.clearTimeout(slideTimer);
  if (reduceMotion.matches || slidePaused || document.hidden) return;
  slideTimer = window.setTimeout(() => {
    showStory(activeSlide + 1);
    scheduleStoryRotation();
  }, 6000);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  let payload = {};
  try {
    payload = response.status === 204 ? {} : await response.json();
  } catch (error) {
    if (response.ok) throw new Error("The sign-in service returned an invalid response.");
  }
  if (!response.ok) {
    const requestError = new Error(payload.error || "Your request could not be completed.");
    requestError.status = response.status;
    requestError.retryAfterSeconds = Number(payload.retryAfterSeconds) || Number(response.headers.get("Retry-After")) || 0;
    throw requestError;
  }
  return payload;
}

async function redirectIfSignedIn() {
  try {
    const adminSession = await requestJson("/api/admin/session");
    if (adminSession.user) {
      window.location.replace("/admin.html");
      return;
    }
  } catch (error) {
    if (error.status !== 401) console.error("Could not check the admin session.", error);
  }

  try {
    const customerSession = await requestJson("/api/customer/session");
    if (customerSession.user) window.location.replace("/index.html");
  } catch (error) {
    if (error.status !== 401) console.error("Could not check the customer session.", error);
  }
}

async function signInAsAdmin(email, password) {
  try {
    await requestJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    window.location.replace("/admin.html");
    return true;
  } catch (error) {
    if (error.status === 401) return false;
    throw error;
  }
}

accountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorNode.hidden = true;
  if (!accountForm.reportValidity()) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const registering = mode === "register";
  submitButton.disabled = true;
  try {
    if (!registering && await signInAsAdmin(email, password)) return;
    const payload = await requestJson(registering ? "/api/customer/register" : "/api/customer/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(registering
        ? { name: nameInput.value.trim(), email, password }
        : { email, password })
    });
    if (!payload.user) throw new Error("The sign-in service did not return an account.");
    window.location.replace(payload.role === "admin" ? "/admin.html" : "/index.html");
  } catch (error) {
    console.error("Unable to authenticate this account.", error);
    if (error.status === 429 && error.retryAfterSeconds > 0) {
      const minutes = Math.ceil(error.retryAfterSeconds / 60);
      errorNode.textContent = `Too many sign-in attempts. Please try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
    } else {
      errorNode.textContent = error.message || "Sign in failed. Please try again.";
    }
    errorNode.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

signinTab.addEventListener("click", () => setMode("signin"));
registerTab.addEventListener("click", () => setMode("register"));
passwordToggle.addEventListener("click", () => {
  const visible = passwordInput.type === "password";
  passwordInput.type = visible ? "text" : "password";
  passwordToggle.textContent = visible ? "Hide" : "Show";
  passwordToggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  passwordToggle.setAttribute("aria-pressed", String(visible));
});

document.getElementById("login-slide-previous").addEventListener("click", () => {
  showStory(activeSlide - 1);
  scheduleStoryRotation();
});
document.getElementById("login-slide-next").addEventListener("click", () => {
  showStory(activeSlide + 1);
  scheduleStoryRotation();
});
storyDots.forEach((dot) => dot.addEventListener("click", () => {
  showStory(Number(dot.dataset.slide));
  scheduleStoryRotation();
}));
storyPanel.addEventListener("mouseenter", () => {
  slidePaused = true;
  window.clearTimeout(slideTimer);
});
storyPanel.addEventListener("mouseleave", () => {
  slidePaused = false;
  scheduleStoryRotation();
});
storyPanel.addEventListener("focusin", () => {
  slidePaused = true;
  window.clearTimeout(slideTimer);
});
storyPanel.addEventListener("focusout", (event) => {
  if (!storyPanel.contains(event.relatedTarget)) {
    slidePaused = false;
    scheduleStoryRotation();
  }
});
document.addEventListener("visibilitychange", scheduleStoryRotation);
reduceMotion.addEventListener("change", scheduleStoryRotation);
setMode("signin");
showStory(activeSlide);
scheduleStoryRotation();
redirectIfSignedIn();

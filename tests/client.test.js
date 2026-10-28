const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const projectRoot = path.join(__dirname, "..");
const pages = [
  "admin.html",
  "cart.html",
  "contact.html",
  "custom-design.html",
  "index.html",
  "login.html",
  "shop.html"
];

function apiResponse(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  };
}

async function openPage(pageName) {
  const html = fs.readFileSync(path.join(projectRoot, pageName), "utf8");
  const dom = new JSDOM(html, {
    url: `http://localhost/${pageName}`,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const { window } = dom;
  const errors = [];
  const requests = [];
  const products = [{
    id: "sample-product",
    name: "Silk Blouse",
    name_mr: "रेशीम ब्लाउज",
    category: "Festive",
    category_mr: "सणासुदीचे",
    description: "Hand-finished silk",
    description_mr: "हाताने तयार केलेले रेशीम",
    price: 2500,
    images: [],
    sizes: [],
    colors: [],
    stock: 5,
    active: true
  }];
  const collections = [{
    id: "sample-collection",
    name: "Silk Sarees",
    nameMr: "रेशमी साड्या",
    category: "Silk Sarees",
    categoryMr: "रेशमी साड्या",
    description: "A sample collection",
    descriptionMr: "नमुना कलेक्शन",
    coverImage: "https://example.com/collection.jpg",
    active: true
  }];

  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {}
  });
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.Element.prototype.scrollIntoView = () => {};
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
  window.URL.createObjectURL = () => "blob:test-image";
  window.URL.revokeObjectURL = () => {};
  window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
  window.alert = () => {};
  window.confirm = () => true;
  window.addEventListener("error", (event) => errors.push(event.error || new Error(event.message)));
  window.fetch = async (input, options = {}) => {
    const url = new URL(input, window.location.href);
    requests.push({ path: url.pathname, method: options.method || "GET" });
    if (url.pathname === "/api/products") return apiResponse(200, { products });
    if (url.pathname === "/api/collections") return apiResponse(200, { collections });
    if (url.pathname === "/api/admin/session" || url.pathname === "/api/customer/session") {
      return apiResponse(401, { error: "Sign-in required" });
    }
    return apiResponse(404, { error: "Not configured in client test" });
  };

  for (const [, source] of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const script = fs.readFileSync(path.join(projectRoot, source), "utf8");
    try {
      window.eval(`${script}\n//# sourceURL=${source}`);
    } catch (error) {
      errors.push(new Error(`${source}: ${error.stack || error.message}`));
    }
  }
  await new Promise((resolve) => window.setTimeout(resolve, 20));
  return { dom, window, errors, requests };
}

test("all page JavaScript modules initialize without browser runtime errors", async () => {
  for (const page of pages) {
    const opened = await openPage(page);
    try {
      assert.deepEqual(opened.errors, [], `${page} raised a client runtime error`);
    } finally {
      opened.dom.window.close();
    }
  }
});

test("home page collection cards render visibly and update with the language selector", async () => {
  const opened = await openPage("index.html");
  try {
    const { document } = opened.window;
    const grid = document.getElementById("collection-grid");
    assert.equal(grid.querySelectorAll(".collection-card").length, 1);
    assert.ok(grid.querySelector(".collection-card").classList.contains("is-visible"));
    assert.match(grid.textContent, /Silk Sarees/);

    document.querySelector('[data-language="mr"]').click();
    assert.match(grid.textContent, /रेशमी साड्या/);
    document.querySelector('[data-language="en"]').click();
    assert.match(grid.textContent, /Silk Sarees/);
    assert.deepEqual(opened.errors, []);
  } finally {
    opened.dom.window.close();
  }
});
test("browse collection products and category filters switch between Marathi and English", async () => {
  const opened = await openPage("shop.html");
  try {
    const { document } = opened.window;
    assert.match(document.getElementById("catalog-grid").textContent, /Silk Blouse/);
    document.querySelector('[data-language="mr"]').click();
    assert.match(document.getElementById("catalog-grid").textContent, /रेशीम ब्लाउज/);
    assert.match(document.getElementById("category-filters").textContent, /सणासुदीचे/);
    document.querySelector('[data-language="en"]').click();
    assert.match(document.getElementById("catalog-grid").textContent, /Silk Blouse/);
    assert.match(document.getElementById("category-filters").textContent, /Festive/);
    assert.deepEqual(opened.errors, []);
  } finally {
    opened.dom.window.close();
  }
});

test("contact form rejects missing required information without sending a request", async () => {
  const opened = await openPage("contact.html");
  try {
    const form = opened.window.document.getElementById("contact-form");
    const event = new opened.window.Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(opened.window.document.getElementById("contact-error").hidden, false);
    assert.equal(opened.requests.some((request) => request.method === "POST"), false);
    assert.deepEqual(opened.errors, []);
  } finally {
    opened.dom.window.close();
  }
});

test("custom design wizard stops at a required unanswered step", async () => {
  const opened = await openPage("custom-design.html");
  try {
    opened.window.document.getElementById("step-next").click();
    assert.equal(opened.window.document.getElementById("form-error").hidden, false);
    assert.equal(opened.requests.some((request) => request.method === "POST"), false);
    assert.deepEqual(opened.errors, []);
  } finally {
    opened.dom.window.close();
  }
});

test("checkout rejects missing delivery and payment details without placing an order", async () => {
  const opened = await openPage("cart.html");
  try {
    const form = opened.window.document.getElementById("checkout-form");
    const event = new opened.window.Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(opened.window.document.getElementById("checkout-error").hidden, false);
    assert.equal(opened.requests.some((request) => request.method === "POST"), false);
    assert.deepEqual(opened.errors, []);
  } finally {
    opened.dom.window.close();
  }
});

test("login rejects empty credentials before making an authentication request", async () => {
  const opened = await openPage("login.html");
  try {
    const form = opened.window.document.getElementById("account-form");
    const event = new opened.window.Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(opened.requests.some((request) => request.method === "POST"), false);
    assert.deepEqual(opened.errors, []);
  } finally {
    opened.dom.window.close();
  }
});

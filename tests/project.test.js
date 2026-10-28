const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const htmlFiles = [
  "admin.html",
  "cart.html",
  "contact.html",
  "custom-design.html",
  "index.html",
  "login.html",
  "shop.html"
];
const formContracts = [
  {
    page: "login.html",
    fields: [
      ['name="email"', /type="email"[^>]*required|type="email"[^>]*maxlength="254"[^>]*required/],
      ['name="password"', /type="password"[^>]*required[^>]*minlength="12"|type="password"[^>]*minlength="12"[^>]*maxlength="1024"[^>]*required/]
    ],
    validationModule: "login.js"
  },
  {
    page: "contact.html",
    fields: [
      ['name="email"', /type="email"[^>]*maxlength="160"[^>]*required/],
      ['name="phone"', /type="tel"[^>]*maxlength="24"[^>]*pattern=/],
      ['name="contactConsent"', /type="checkbox"[^>]*required/],
      ['name="message"', /maxlength="3000"[^>]*required/]
    ],
    validationModule: "contact.js"
  },
  {
    page: "cart.html",
    fields: [
      ['name="phone"', /type="tel"[^>]*maxlength="24"[^>]*pattern=[^>]*required/],
      ['name="email"', /type="email"[^>]*maxlength="160"[^>]*required/],
      ['name="postalCode"', /inputmode="numeric"[^>]*maxlength="12"[^>]*pattern="\[0-9\]\{6\}"[^>]*required/],
      ['name="paymentMethod"', /type="radio"[^>]*required/]
    ],
    validationModule: "cart.js"
  },
  {
    page: "custom-design.html",
    fields: [
      ['name="blouseType"', /type="radio"[^>]*required/],
      ['name="phone"', /type="tel"[^>]*maxlength="24"[^>]*pattern=[^>]*required/],
      ['name="measurements[bust]"', /type="number"[^>]*min="40"[^>]*max="180"/],
      ['name="referenceImages"', /type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"[^>]*multiple/],
      ['name="contactConsent"', /type="checkbox"[^>]*required/]
    ],
    validationModule: "custom-studio.js"
  },
  {
    page: "admin.html",
    fields: [
      ['name="price"', /type="number"[^>]*min="0"[^>]*max="10000000"[^>]*step="0\.01"[^>]*required/],
      ['name="stock"', /type="number"[^>]*min="0"[^>]*max="1000000"[^>]*step="1"[^>]*value="0"[^>]*required/],
      ['name="images"', /type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp"[^>]*multiple/],
      ['name="sortOrder"', /type="number"[^>]*min="0"[^>]*max="10000"[^>]*step="1"[^>]*required/]
    ],
    validationModule: "admin.js"
  }
];

function read(relativePath) {
  const publicPath = path.join(projectRoot, "public", relativePath);
  const filePath = fs.existsSync(publicPath) ? publicPath : path.join(projectRoot, relativePath);
  return fs.readFileSync(filePath, "utf8");
}

test("all application pages reference existing local JavaScript modules", () => {
  for (const htmlFile of htmlFiles) {
    const markup = read(htmlFile);
    const scripts = [...markup.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)];
    assert.ok(scripts.length, `${htmlFile} should load its page controller`);
    for (const [, source] of scripts) {
      if (/^(?:https?:)?\/\//i.test(source)) continue;
      const localPath = path.resolve(projectRoot, "public", source);
      assert.ok(fs.existsSync(localPath), `${htmlFile} references missing script ${source}`);
    }
  }
});

test("all application page JavaScript modules pass Node syntax validation", () => {
  const scripts = fs.readdirSync(path.join(projectRoot, "public"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => path.join("public", file));
  scripts.push("index.js", "server.js");
  scripts.push(...fs.readdirSync(path.join(projectRoot, "scripts"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => path.join("scripts", file)));

  for (const script of scripts) {
    const result = spawnSync(process.execPath, ["--check", path.join(projectRoot, script)], { encoding: "utf8" });
    assert.equal(result.status, 0, `${script} syntax check failed:\n${result.stderr}`);
  }
});

test("each user-facing form defines field constraints and a matching validation handler", () => {
  for (const contract of formContracts) {
    const markup = read(contract.page);
    const validationModule = read(contract.validationModule);
    for (const [field, constraint] of contract.fields) {
      const fieldPattern = new RegExp(`<(?:(?:input|select|textarea))\\b(?=[^>]*\\b${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[^>]*>`, "i");
      const match = markup.match(fieldPattern);
      assert.ok(match, `${contract.page} is missing ${field}`);
      assert.match(match[0], constraint, `${contract.page} ${field} is missing its expected validation constraint`);
    }
    assert.match(markup, /<form\b[^>]*\bnovalidate\b/i, `${contract.page} should deliberately route invalid input through its accessible handler`);
    assert.match(validationModule, /addEventListener\(["']submit["']/i, `${contract.validationModule} must handle form submission`);
    assert.match(validationModule, /checkValidity|reportValidity/i, `${contract.validationModule} must enforce the page's constraints`);
  }
});

test("HTML IDs are unique on every application page", () => {
  for (const htmlFile of htmlFiles) {
    const ids = [...read(htmlFile).matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert.deepEqual([...new Set(duplicates)], [], `${htmlFile} contains duplicate IDs`);
  }
});

test("Vercel deployment config bundles protected pages and serves static assets from public", () => {
  const configuration = JSON.parse(read("vercel.json"));
  assert.equal(configuration.functions["index.js"].includeFiles, "*.html");
  assert.equal(configuration.functions["index.js"].maxDuration, 30);
  assert.ok(fs.existsSync(path.join(projectRoot, "public", "styles.css")));
  assert.ok(fs.existsSync(path.join(projectRoot, "public", "admin.html")));
  assert.match(read("index.js"), /module\.exports = createApp\(pool\)/);
  for (const page of ["index.html", "shop.html", "cart.html", "contact.html", "custom-design.html"]) {
    assert.ok(fs.existsSync(path.join(projectRoot, page)), `${page} must remain behind the signed-in Express route.`);
    assert.equal(fs.existsSync(path.join(projectRoot, "public", page)), false, `${page} must not bypass authentication via static hosting.`);
  }
});

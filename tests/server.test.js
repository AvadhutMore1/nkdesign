const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createApp, hashPassword, isValidEmail, slugify, validateCollectionInput, validateProductInput, verifyPassword } = require("../server");
const { createOrUpdateAdmin } = require("../scripts/create-admin");

test("collection input accepts bilingual fields and valid attributes", () => {
  const result = validateCollectionInput({
    name: "Bridal & Festive",
    nameMr: "वधू संग्रह",
    category: "Bridal",
    categoryMr: "वधू",
    description: "Hand-finished pieces",
    coverImage: "https://example.com/cover.jpg",
    sortOrder: 3,
    featured: true,
    active: false,
    attributes: [{ name: "Fabric", value: "Silk" }]
  });

  assert.equal(result.error, undefined);
  assert.equal(result.value.name, "Bridal & Festive");
  assert.equal(result.value.active, false);
  assert.deepEqual(result.value.attributes, [{ name: "Fabric", value: "Silk" }]);
});

test("collection input rejects unsafe cover URLs and invalid display order", () => {
  const base = { name: "Festive", category: "Occasion", sortOrder: 0 };
  assert.match(validateCollectionInput({ ...base, coverImage: "javascript:alert(1)" }).error, /HTTPS/);
  assert.match(validateCollectionInput({ ...base, sortOrder: -1 }).error, /Display order/);
});

test("product input requires valid pricing, attributes, and at least one uploaded photo", () => {
  const body = {
    name: "Silk Blouse",
    category: "Festive",
    price: 2500,
    discountPrice: 2200,
    stock: 4,
    sizes: ["S", "M"],
    colors: ["Wine"],
    active: true
  };
  assert.match(validateProductInput(body, [], []).error, /product photo/i);
  assert.equal(validateProductInput(body, [], [{ filename: "image.png" }]).value.images.length, 1);
  assert.equal(validateProductInput({ ...body, price: 2500.55 }, [], [{ filename: "image.png" }]).error, undefined);
  assert.match(validateProductInput({ ...body, price: 2500.555 }, [], [{ filename: "image.png" }]).error, /two decimal places/i);
  assert.match(validateProductInput({ ...body, price: undefined }, [], [{ filename: "image.png" }]).error, /price is required/i);
  assert.match(validateProductInput({ ...body, discountPrice: 2200.555 }, [], [{ filename: "image.png" }]).error, /Discount price/);
  assert.match(validateProductInput({ ...body, stock: undefined }, [], [{ filename: "image.png" }]).error, /stock is required/i);
  assert.match(validateProductInput({ ...body, discountPrice: 3000 }, [], [{ filename: "image.png" }]).error, /Discount price/);
  assert.match(validateProductInput(body, ["/uploads/products/another-product.png"], []).error, /image list/i);
  assert.match(validateProductInput(body, [], null).error, /uploaded product photos/i);
});

test("email validation rejects malformed and oversized addresses", () => {
  assert.equal(isValidEmail("customer@example.com"), true);
  assert.equal(isValidEmail(" Customer+sale@Example.co.uk "), false);
  assert.equal(isValidEmail("missing-at.example.com"), false);
  assert.equal(isValidEmail(`user@${"a".repeat(250)}.com`), false);
  assert.equal(isValidEmail(null), false);
});

test("Marathi collection names produce a stable usable slug", () => {
  assert.equal(slugify("वधू संग्रह"), slugify("वधू संग्रह"));
  assert.match(slugify("वधू संग्रह"), /^collection-[a-f0-9]{16}$/);
});

test("password hashes verify without storing plaintext", () => {
  const storedHash = hashPassword("correct horse battery staple");
  assert.notEqual(storedHash, "correct horse battery staple");
  assert.equal(verifyPassword("correct horse battery staple", storedHash), true);
  assert.equal(verifyPassword("incorrect password", storedHash), false);
});

test("public collections are readable while admin collection data requires a session", async () => {
  const pool = {
    async query() {
      return [[{
        id: 7,
        slug: "bridal",
        name: "Bridal",
        name_mr: "",
        category: "Bridal",
        category_mr: "",
        description: "",
        description_mr: "",
        cover_image: "",
        sort_order: 0,
        attributes: [],
        featured: false,
        active: true,
        created_at: new Date(),
        updated_at: new Date()
      }], []];
    },
    async execute() {
      throw new Error("An unauthenticated request must not query protected data.");
    }
  };
  const server = createApp(pool).listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const publicResponse = await fetch(`${baseUrl}/api/collections`);
    const publicPayload = await publicResponse.json();
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.headers.get("cache-control"), "no-store");
    assert.equal(publicPayload.collections[0].name, "Bridal");

    const adminResponse = await fetch(`${baseUrl}/api/admin/collections`);
    assert.equal(adminResponse.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("deployment health check verifies the database connection", async () => {
  let healthChecks = 0;
  const pool = {
    async query(sql) {
      assert.equal(sql, "SELECT 1");
      healthChecks += 1;
      return [[{ 1: 1 }], []];
    },
    async execute() {
      throw new Error("Health checks must not query protected application data.");
    }
  };
  const server = createApp(pool).listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
    assert.equal(healthChecks, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("admin sessions can access storefront pages without requiring a session table id column", async () => {
  const pool = {
    async query() {
      return [[], []];
    },
    async execute(sql) {
      assert.match(sql, /^SELECT 1 FROM admin_sessions/);
      return [[{ 1: 1 }], []];
    }
  };
  const server = createApp(pool).listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/index.html`, {
      headers: { Cookie: `nk_design_admin=${"a".repeat(64)}` }
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /NK Design/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("the admin session can create, update, and permanently delete collections", async () => {
  const password = "correct horse battery staple";
  const admin = {
    id: 1,
    name: "Studio Admin",
    email: "admin@example.com",
    password_hash: hashPassword(password)
  };
  const sessions = new Map();
  const collections = new Map();
  let nextCollectionId = 1;
  const pool = {
    async query(sql) {
      const rows = [...collections.values()].filter((item) => !sql.includes("WHERE active = TRUE") || item.active);
      return [rows, []];
    },
    async execute(sql, values) {
      if (sql.includes("FROM admin_users WHERE email")) return [[admin.email === values[0] ? admin : undefined].filter(Boolean), []];
      if (sql.includes("INSERT INTO admin_sessions")) {
        sessions.set(values[0], admin);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes("FROM admin_sessions s")) {
        const sessionAdmin = sessions.get(values[0]);
        return [sessionAdmin ? [{ id: sessionAdmin.id, name: sessionAdmin.name, email: sessionAdmin.email }] : [], []];
      }
      if (sql.startsWith("INSERT INTO collections")) {
        const row = {
          id: nextCollectionId++,
          slug: values[0],
          name: values[1],
          name_mr: values[2],
          category: values[3],
          category_mr: values[4],
          description: values[5],
          description_mr: values[6],
          cover_image: values[7],
          sort_order: values[8],
          attributes: JSON.parse(values[9]),
          featured: values[10],
          active: values[11]
        };
        collections.set(row.id, row);
        return [{ affectedRows: 1, insertId: row.id }, []];
      }
      if (sql.startsWith("UPDATE collections SET")) {
        const [slug, name, nameMr, category, categoryMr, description, descriptionMr, coverImage, sortOrder, attributes, featured, active, id] = values;
        const row = collections.get(id);
        if (!row) return [{ affectedRows: 0 }, []];
        Object.assign(row, {
          slug, name, name_mr: nameMr, category, category_mr: categoryMr, description,
          description_mr: descriptionMr, cover_image: coverImage, sort_order: sortOrder,
          attributes: JSON.parse(attributes), featured, active
        });
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith("DELETE FROM collections")) {
        return [{ affectedRows: collections.delete(values[0]) ? 1 : 0 }, []];
      }
      if (sql.startsWith("SELECT * FROM collections WHERE id =")) {
        const row = collections.get(values[0]);
        return [row ? [row] : [], []];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };
  const server = createApp(pool).listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const loginResponse = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { Origin: baseUrl, "Content-Type": "application/json" },
      body: JSON.stringify({ email: admin.email, password })
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie").match(/^nk_design_admin=[a-f0-9]{64}/)[0];
    const headers = { Origin: baseUrl, Cookie: cookie, "Content-Type": "application/json" };
    const collectionInput = { name: "Bridal Edit", category: "Bridal", sortOrder: 1, attributes: [] };

    const createResponse = await fetch(`${baseUrl}/api/admin/collections`, {
      method: "POST",
      headers,
      body: JSON.stringify(collectionInput)
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()).collection;
    assert.equal(created.name, "Bridal Edit");

    const updateResponse = await fetch(`${baseUrl}/api/admin/collections/${created.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ ...collectionInput, name: "Festive Edit", active: false })
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).collection.name, "Festive Edit");
    assert.equal((await (await fetch(`${baseUrl}/api/collections`)).json()).collections.length, 0);

    const deleteResponse = await fetch(`${baseUrl}/api/admin/collections/${created.id}`, {
      method: "DELETE",
      headers
    });
    assert.equal(deleteResponse.status, 204);
    assert.equal(collections.size, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("admin can upload product photos and publish, update, and delete product images", async () => {
  const products = new Map();
  let nextProductId = 1;
  const admin = { id: 1, name: "Studio Admin", email: "admin@example.com" };
  const pool = {
    async query(sql) {
      if (sql.includes("FROM products WHERE active = TRUE")) {
        return [[...products.values()].filter((product) => product.active), []];
      }
      if (sql.includes("FROM products ORDER BY")) return [[...products.values()], []];
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async execute(sql, values) {
      if (sql.includes("FROM admin_sessions s")) return [[admin], []];
      if (sql.startsWith("INSERT INTO products")) {
        const row = {
          id: nextProductId++,
          name: values[0],
          name_mr: values[1],
          description: values[2],
          description_mr: values[3],
          category: values[4],
          category_mr: values[5],
          price: values[6],
          discount_price: values[7],
          images: JSON.parse(values[8]),
          sizes: JSON.parse(values[9]),
          colors: JSON.parse(values[10]),
          stock: values[11],
          active: values[12],
          whatsapp_message: values[13]
        };
        products.set(row.id, row);
        return [{ insertId: row.id, affectedRows: 1 }, []];
      }
      if (sql.startsWith("SELECT * FROM products WHERE id =")) {
        const row = products.get(Number(values[0]));
        return [row ? [row] : [], []];
      }
      if (sql.startsWith("UPDATE products SET")) {
        const [
          name, nameMr, description, descriptionMr, category, categoryMr, price, discountPrice,
          images, sizes, colors, stock, active, whatsappMessage, id
        ] = values;
        const row = products.get(Number(id));
        if (!row) return [{ affectedRows: 0 }, []];
        Object.assign(row, {
          name, name_mr: nameMr, description, description_mr: descriptionMr,
          category, category_mr: categoryMr, price, discount_price: discountPrice,
          images: JSON.parse(images), sizes: JSON.parse(sizes), colors: JSON.parse(colors),
          stock, active, whatsapp_message: whatsappMessage
        });
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith("SELECT images FROM products WHERE id =")) {
        const row = products.get(Number(values[0]));
        return [row ? [{ images: row.images }] : [], []];
      }
      if (sql.startsWith("DELETE FROM products WHERE id =")) {
        return [{ affectedRows: products.delete(Number(values[0])) ? 1 : 0 }, []];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };
  const server = createApp(pool).listen(0);
  let uploadedImages = [];

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = {
      Origin: baseUrl,
      Cookie: `nk_design_admin=${"a".repeat(64)}`
    };
    const details = {
      name: "Silk Blouse",
      nameMr: "रेशीम ब्लाउज",
      description: "Hand-finished silk",
      descriptionMr: "",
      category: "Festive",
      categoryMr: "",
      price: 2500,
      discountPrice: 2200,
      stock: 4,
      sizes: ["S", "M"],
      colors: ["Wine"],
      active: true
    };
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const createForm = new FormData();
    createForm.append("product", JSON.stringify(details));
    createForm.append("existingImages", "[]");
    createForm.append("images", new Blob([pngSignature], { type: "image/png" }), "blouse.png");
    const createResponse = await fetch(`${baseUrl}/api/admin/products`, {
      method: "POST",
      headers,
      body: createForm
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()).product;
    uploadedImages = [...created.images];
    assert.equal(created.name, "Silk Blouse");
    assert.equal(created.discount_price, 2200);

    const publicResponse = await fetch(`${baseUrl}/api/products`);
    assert.equal((await publicResponse.json()).products.length, 1);
    const firstPhotoResponse = await fetch(`${baseUrl}${created.images[0]}`);
    assert.equal(firstPhotoResponse.status, 200);

    const updateForm = new FormData();
    updateForm.append("product", JSON.stringify({ ...details, name: "Updated Silk Blouse" }));
    updateForm.append("existingImages", JSON.stringify(created.images));
    updateForm.append("images", new Blob([pngSignature], { type: "image/png" }), "detail.png");
    const updateResponse = await fetch(`${baseUrl}/api/admin/products/${created.id}`, {
      method: "PUT",
      headers,
      body: updateForm
    });
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()).product;
    uploadedImages = [...updated.images];
    assert.equal(updated.name, "Updated Silk Blouse");
    assert.equal(updated.images.length, 2);

    const deleteResponse = await fetch(`${baseUrl}/api/admin/products/${created.id}`, {
      method: "DELETE",
      headers
    });
    assert.equal(deleteResponse.status, 204);
    uploadedImages = [];
    assert.equal((await (await fetch(`${baseUrl}/api/products`)).json()).products.length, 0);
    assert.equal((await fetch(`${baseUrl}${updated.images[0]}`)).status, 404);
  } finally {
    await Promise.all(uploadedImages.map((image) =>
      fs.unlink(path.join(__dirname, "..", image.slice(1).replaceAll("/", path.sep))).catch(() => {})
    ));
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("admin product upload rejects content that does not match its declared image type", async () => {
  const admin = { id: 1, name: "Studio Admin", email: "admin@example.com" };
  const pool = {
    async query() {
      return [[], []];
    },
    async execute(sql) {
      if (sql.includes("FROM admin_sessions s")) return [[admin], []];
      throw new Error(`Unexpected SQL in invalid image test: ${sql}`);
    }
  };
  const server = createApp(pool).listen(0);
  let uploadedImage = "";

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const directory = path.join(__dirname, "..", "uploads", "products");
    const existing = new Set(await fs.readdir(directory));
    const form = new FormData();
    form.append("product", JSON.stringify({
      name: "Invalid image",
      category: "Testing",
      price: 250,
      stock: 1,
      sizes: [],
      colors: []
    }));
    form.append("existingImages", "[]");
    form.append("images", new Blob(["not a PNG"], { type: "image/png" }), "fake.png");
    const response = await fetch(`${baseUrl}/api/admin/products`, {
      method: "POST",
      headers: {
        Origin: baseUrl,
        Cookie: `nk_design_admin=${"a".repeat(64)}`
      },
      body: form
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /not a valid/i);
    const filesAfterRequest = await fs.readdir(directory);
    uploadedImage = filesAfterRequest.find((filename) => !existing.has(filename)) || "";
    assert.equal(uploadedImage, "", "Rejected image data must be removed from disk.");
  } finally {
    if (uploadedImage) await fs.unlink(path.join(__dirname, "..", "uploads", "products", uploadedImage)).catch(() => {});
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("the login page routes customers to the storefront and guards storefront pages", async () => {
  const customers = new Map();
  const customerSessions = new Map();
  let nextCustomerId = 1;
  const pool = {
    async query() {
      return [[], []];
    },
    async execute(sql, values) {
      if (sql.includes("SELECT id FROM admin_users WHERE email")) return [[], []];
      if (sql.startsWith("INSERT INTO customers")) {
        const customer = { id: nextCustomerId++, name: values[0], email: values[1], password_hash: values[2] };
        customers.set(customer.email, customer);
        return [{ insertId: customer.id, affectedRows: 1 }, []];
      }
      if (sql.includes("FROM customer_sessions s")) {
        const customer = customerSessions.get(values[0]);
        return [customer ? [{ id: customer.id, name: customer.name, email: customer.email }] : [], []];
      }
      if (sql.startsWith("DELETE FROM customer_sessions")) {
        return [{ affectedRows: customerSessions.delete(values[0]) ? 1 : 0 }, []];
      }
      if (sql.startsWith("INSERT INTO customer_sessions")) {
        const customer = customers.get("customer@example.com");
        customerSessions.set(values[0], customer);
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  };
  const server = createApp(pool).listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const rootResponse = await fetch(baseUrl, { redirect: "manual" });
    assert.equal(rootResponse.status, 302);
    assert.equal(rootResponse.headers.get("location"), "/login.html");

    const guardedResponse = await fetch(`${baseUrl}/index.html`, { redirect: "manual" });
    assert.equal(guardedResponse.status, 302);
    assert.equal(guardedResponse.headers.get("location"), "/login.html");

    const registerResponse = await fetch(`${baseUrl}/api/customer/register`, {
      method: "POST",
      headers: { Origin: baseUrl, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "NK Customer",
        email: "customer@example.com",
        password: "correct horse battery staple"
      })
    });
    assert.equal(registerResponse.status, 201);
    assert.match(registerResponse.headers.get("set-cookie"), /^nk_design_customer=[a-f0-9]{64}/);
    assert.equal((await registerResponse.json()).role, "customer");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("authentication APIs reject malformed input before querying the database", async () => {
  let queries = 0;
  const pool = {
    async query() {
      queries += 1;
      return [[], []];
    },
    async execute() {
      queries += 1;
      return [[], []];
    }
  };
  const server = createApp(pool).listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = (route, body) => fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { Origin: baseUrl, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const cases = [
      ["/api/admin/login", { email: "not-an-email", password: "password" }],
      ["/api/admin/login", { email: "admin@example.com", password: "" }],
      ["/api/customer/register", { name: "Customer", email: "invalid", password: "correct horse battery staple" }],
      ["/api/customer/register", { name: " ", email: "customer@example.com", password: "correct horse battery staple" }],
      ["/api/customer/register", { name: "Customer", email: "customer@example.com", password: "short" }],
      ["/api/customer/login", { email: "invalid", password: "password" }],
      ["/api/customer/login", { email: "customer@example.com", password: "" }]
    ];

    for (const [route, body] of cases) {
      const response = await request(route, body);
      assert.equal(response.status, 400, `${route} should reject invalid input`);
      assert.equal(typeof (await response.json()).error, "string");
    }
    assert.equal(queries, 0, "Invalid authentication input must not reach the database.");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("login rate limits provide a retry time and are separate per account type", async () => {
  const pool = {
    async query() {
      return [[], []];
    },
    async execute() {
      return [[], []];
    }
  };
  const server = createApp(pool).listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const options = {
      method: "POST",
      headers: { Origin: baseUrl, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.com", password: "incorrect password" })
    };

    let response;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      response = await fetch(`${baseUrl}/api/admin/login`, options);
      assert.equal(response.status, 401);
    }
    response = await fetch(`${baseUrl}/api/admin/login`, options);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
    assert.ok((await response.json()).retryAfterSeconds > 0);

    const customerResponse = await fetch(`${baseUrl}/api/customer/login`, options);
    assert.equal(customerResponse.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("terminal admin setup creates the first admin and updates that same account", async () => {
  const admins = [];
  let savedPasswordHash = "";
  const connection = {
    async query(sql) {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }], []];
      if (sql.includes("FROM admin_users")) return [admins.map(({ id, email }) => ({ id, email })), []];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }], []];
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async execute(sql, values) {
      if (sql.startsWith("SELECT id FROM customers")) return [[], []];
      if (sql.startsWith("INSERT INTO admin_users")) {
        admins.push({ id: 1, email: values[1] });
        savedPasswordHash = values[2];
        return [{ insertId: 1 }, []];
      }
      if (sql.startsWith("UPDATE admin_users")) {
        savedPasswordHash = values[1];
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {}
  };
  const pool = { async getConnection() { return connection; } };

  const created = await createOrUpdateAdmin(pool, {
    name: "Studio Admin",
    email: "admin@example.com",
    password: "first secure password"
  });
  assert.equal(created, "created");
  assert.equal(admins.length, 1);
  assert.equal(verifyPassword("first secure password", savedPasswordHash), true);

  const updated = await createOrUpdateAdmin(pool, {
    name: "Studio Admin",
    email: "admin@example.com",
    password: "replacement secure password"
  });
  assert.equal(updated, "updated");
  assert.equal(admins.length, 1);
  assert.equal(verifyPassword("replacement secure password", savedPasswordHash), true);
});

test("terminal admin setup does not add a second admin account", async () => {
  const connection = {
    async query(sql) {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }], []];
      if (sql.includes("FROM admin_users")) return [[{ id: 1, email: "existing@example.com" }], []];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }], []];
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async execute(sql) {
      if (sql.startsWith("SELECT id FROM customers")) return [[], []];
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {}
  };

  await assert.rejects(
    createOrUpdateAdmin({ async getConnection() { return connection; } }, {
      name: "Another Admin",
      email: "another@example.com",
      password: "another secure password"
    }),
    /An admin account already exists/
  );
});

test("terminal admin replacement removes the old admin and creates only the confirmed replacement", async () => {
  const admins = [{ id: 1, email: "old-admin@example.com" }];
  const removedIds = [];
  let insertedAdmin;
  const connection = {
    async query(sql) {
      if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }], []];
      if (sql.includes("FROM admin_users")) return [admins.map(({ id, email }) => ({ id, email })), []];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }], []];
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async execute(sql, values) {
      if (sql.startsWith("SELECT id FROM customers")) return [[], []];
      if (sql.startsWith("DELETE FROM admin_users")) {
        removedIds.push(values[0]);
        admins.splice(0, admins.length);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith("INSERT INTO admin_users")) {
        insertedAdmin = { id: 2, email: values[1] };
        admins.push(insertedAdmin);
        return [{ insertId: 2 }, []];
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {}
  };

  const result = await createOrUpdateAdmin(
    { async getConnection() { return connection; } },
    { name: "New Admin", email: "new-admin@example.com", password: "replacement secure password" },
    { replaceExisting: true }
  );
  assert.equal(result, "replaced");
  assert.deepEqual(removedIds, [1]);
  assert.deepEqual(admins, [insertedAdmin]);
});

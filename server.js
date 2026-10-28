require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const multer = require("multer");
const mysql = require("mysql2/promise");

const SESSION_COOKIE = "nk_design_admin";
const CUSTOMER_SESSION_COOKIE = "nk_design_customer";
const SESSION_DURATION_HOURS = 8;
const MAX_ATTRIBUTES = 30;
const MAX_PRODUCT_IMAGES = 5;
const MAX_PRODUCT_IMAGE_SIZE = 3 * 1024 * 1024;
const MAX_PRODUCT_UPLOAD_SIZE = 4 * 1024 * 1024;
const isVercel = process.env.VERCEL === "1";
const publicDirectory = path.join(__dirname, "public");
const productImageDirectory = isVercel
  ? path.join(os.tmpdir(), "nk-design-product-uploads")
  : path.join(__dirname, "uploads", "products");

function isProductImageUrl(value) {
  if (typeof value !== "string") return false;
  if (/^\/uploads\/products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && /^\/products\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `collection-${crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 16)}`;
}

function isValidEmail(value) {
  return typeof value === "string"
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateProductInput(body, existingImages, uploadedFiles) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Product details must be an object." };
  }

  const fields = {
    name: 100,
    nameMr: 100,
    description: 600,
    descriptionMr: 600,
    category: 80,
    categoryMr: 80,
    whatsappMessage: 500
  };
  const input = {};
  for (const [field, maxLength] of Object.entries(fields)) {
    const value = body[field] == null ? "" : body[field];
    if (typeof value !== "string" || value.length > maxLength) {
      return { error: `${field} must be a string of at most ${maxLength} characters.` };
    }
    input[field] = value.trim();
  }
  if (!input.name || !input.category) return { error: "Product name and category are required." };

  if (body.price == null || body.price === "") {
    return { error: "Price is required." };
  }
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0 || price > 10000000 || Number(price.toFixed(2)) !== price) {
    return { error: "Price must be between 0 and 10000000 with at most two decimal places." };
  }
  const discountPrice = body.discountPrice == null || body.discountPrice === "" ? null : Number(body.discountPrice);
  if (discountPrice !== null && (!Number.isFinite(discountPrice) || Number(discountPrice.toFixed(2)) !== discountPrice
    || discountPrice <= 0 || discountPrice >= price)) {
    return { error: "Discount price must be greater than zero and lower than the regular price." };
  }
  if (body.stock == null || body.stock === "") return { error: "Stock is required." };
  const stock = Number(body.stock);
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
    return { error: "Stock must be a whole number between 0 and 1000000." };
  }
  if (body.active != null && typeof body.active !== "boolean") {
    return { error: "Active must be true or false." };
  }

  for (const field of ["sizes", "colors"]) {
    if (!Array.isArray(body[field]) || body[field].length > 20
      || body[field].some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 40)) {
      return { error: `${field} must contain up to 20 non-empty values of 40 characters or fewer.` };
    }
  }
  if (!Array.isArray(existingImages) || existingImages.length > MAX_PRODUCT_IMAGES
    || existingImages.some((image) => !isProductImageUrl(image))) {
    return { error: "Product image list is invalid." };
  }
  if (!Array.isArray(uploadedFiles)) return { error: "Uploaded product photos are invalid." };
  const images = [...new Set([
    ...existingImages,
    ...uploadedFiles.map((file) => file.blobUrl || `/uploads/products/${file.filename}`)
  ])];
  if (!images.length || images.length > MAX_PRODUCT_IMAGES) {
    return { error: `Add between 1 and ${MAX_PRODUCT_IMAGES} product photos.` };
  }

  return {
    value: {
      ...input,
      price,
      discountPrice,
      stock,
      active: body.active !== false,
      sizes: [...new Set(body.sizes.map((value) => value.trim()))],
      colors: [...new Set(body.colors.map((value) => value.trim()))],
      images
    }
  };
}

function parseJsonField(value, label) {
  if (typeof value !== "string") throw new Error(`${label} must be JSON.`);
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

async function validateImageFile(file) {
  const signature = await fs.promises.readFile(file.path).then((content) => content.subarray(0, 12));
  const isJpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff;
  const isPng = signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP";
  return (file.mimetype === "image/jpeg" && isJpeg)
    || (file.mimetype === "image/png" && isPng)
    || (file.mimetype === "image/webp" && isWebp);
}

async function removeUploadedImages(files) {
  await Promise.all((files || []).map(async (file) => {
    if (file.blobUrl) {
      const { del } = await import("@vercel/blob");
      await del(file.blobUrl);
    }
    await fs.promises.unlink(file.path).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }));
}

async function persistUploadedImages(files) {
  if (!isVercel) return;
  const { put } = await import("@vercel/blob");
  for (const file of files) {
    const content = await fs.promises.readFile(file.path);
    const uploaded = await put(`products/${file.filename}`, content, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.mimetype
    });
    file.blobUrl = uploaded.url;
    await fs.promises.unlink(file.path);
  }
}

async function removeProductImages(images) {
  await Promise.all((Array.isArray(images) ? images : []).map(async (image) => {
    if (typeof image !== "string") return;
    if (/^https:\/\//i.test(image)) {
      if (!isProductImageUrl(image)) return;
      const { del } = await import("@vercel/blob");
      await del(image);
      return;
    }
    if (!isProductImageUrl(image)) return;
    const filename = path.basename(image);
    await fs.promises.unlink(path.join(productImageDirectory, filename)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }));
}

function productFromRow(row) {
  return {
    id: String(row.id),
    name: row.name,
    name_mr: row.name_mr,
    description: row.description,
    description_mr: row.description_mr,
    category: row.category,
    category_mr: row.category_mr,
    price: Number(row.price),
    discount_price: row.discount_price == null ? null : Number(row.discount_price),
    images: row.images,
    sizes: row.sizes,
    colors: row.colors.map((name) => ({ name })),
    stock: row.stock,
    active: Boolean(row.active),
    whatsapp_message: row.whatsapp_message
  };
}

function validateCollectionInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Collection details must be an object." };
  }

  const textFields = {
    name: 100,
    nameMr: 100,
    category: 80,
    categoryMr: 80,
    description: 600,
    descriptionMr: 600,
    coverImage: 1000
  };
  const input = {};

  for (const [field, maxLength] of Object.entries(textFields)) {
    const value = body[field] == null ? "" : body[field];
    if (typeof value !== "string" || value.length > maxLength) {
      return { error: `${field} must be a string of at most ${maxLength} characters.` };
    }
    input[field] = value.trim();
  }

  if (!input.name || !input.category) {
    return { error: "Collection name and category are required." };
  }
  if (input.coverImage) {
    let imageUrl;
    try {
      imageUrl = new URL(input.coverImage);
    } catch {
      return { error: "Cover image must be a valid HTTPS URL." };
    }
    if (imageUrl.protocol !== "https:") return { error: "Cover image must use HTTPS." };
  }

  const sortOrder = Number(body.sortOrder);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
    return { error: "Display order must be a whole number between 0 and 10000." };
  }

  if (body.featured != null && typeof body.featured !== "boolean") {
    return { error: "Featured must be true or false." };
  }
  if (body.active != null && typeof body.active !== "boolean") {
    return { error: "Active must be true or false." };
  }

  const rawAttributes = body.attributes == null ? [] : body.attributes;
  if (!Array.isArray(rawAttributes) || rawAttributes.length > MAX_ATTRIBUTES) {
    return { error: `Attributes must be an array of at most ${MAX_ATTRIBUTES} items.` };
  }
  const attributes = [];
  for (const attribute of rawAttributes) {
    if (!attribute || typeof attribute !== "object" || Array.isArray(attribute)
      || typeof attribute.name !== "string" || typeof attribute.value !== "string"
      || attribute.name.trim().length > 60 || attribute.value.trim().length > 160) {
      return { error: "Each attribute needs a name (up to 60 characters) and value (up to 160 characters)." };
    }
    const name = attribute.name.trim();
    const value = attribute.value.trim();
    if (name && value) attributes.push({ name, value });
  }

  return {
    value: {
      ...input,
      sortOrder,
      featured: body.featured === true,
      active: body.active !== false,
      attributes
    }
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== "string") return false;
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(expectedHex || "")) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) return entry.slice(separator + 1).trim();
  }
  return "";
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_HOURS * 60 * 60}${secure}`);
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

function writeSessionCookie(res, cookieName, token, maxAge = SESSION_DURATION_HOURS * 60 * 60) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

function clearNamedSessionCookie(res, cookieName) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`);
}

async function createTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(180) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      admin_id BIGINT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_sessions_user FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
      INDEX idx_admin_sessions_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      password_hash VARCHAR(180) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      customer_id BIGINT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_customer_sessions_user FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      INDEX idx_customer_sessions_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(120) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      name_mr VARCHAR(100) NOT NULL DEFAULT '',
      category VARCHAR(80) NOT NULL,
      category_mr VARCHAR(80) NOT NULL DEFAULT '',
      description VARCHAR(600) NOT NULL DEFAULT '',
      description_mr VARCHAR(600) NOT NULL DEFAULT '',
      cover_image VARCHAR(1000) NOT NULL DEFAULT '',
      sort_order INT UNSIGNED NOT NULL DEFAULT 0,
      attributes JSON NOT NULL,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_collections_visibility (active, sort_order, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      name_mr VARCHAR(100) NOT NULL DEFAULT '',
      description VARCHAR(600) NOT NULL DEFAULT '',
      description_mr VARCHAR(600) NOT NULL DEFAULT '',
      category VARCHAR(80) NOT NULL,
      category_mr VARCHAR(80) NOT NULL DEFAULT '',
      price DECIMAL(10,2) NOT NULL,
      discount_price DECIMAL(10,2) NULL,
      images JSON NOT NULL,
      sizes JSON NOT NULL,
      colors JSON NOT NULL,
      stock INT UNSIGNED NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      whatsapp_message VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_products_visibility (active, category, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function bootstrapAdmin(pool) {
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM admin_users");
  if (Number(total) > 0) return;

  const email = requiredEnv("ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("ADMIN_PASSWORD");
  const name = process.env.ADMIN_NAME?.trim() || "NK Design Admin";
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL must be a valid email address.");
  try {
    await pool.execute(
      "INSERT INTO admin_users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.slice(0, 100), email, hashPassword(password)]
    );
    console.log(`Created the initial admin account for ${email}.`);
  } catch (error) {
    if (error.code !== "ER_DUP_ENTRY") throw error;
    const [[{ total: adminsAfterRace }]] = await pool.query("SELECT COUNT(*) AS total FROM admin_users");
    if (Number(adminsAfterRace) === 0) throw error;
  }
}

function collectionFromRow(row) {
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    nameMr: row.name_mr,
    category: row.category,
    categoryMr: row.category_mr,
    description: row.description,
    descriptionMr: row.description_mr,
    coverImage: row.cover_image,
    sortOrder: row.sort_order,
    attributes: row.attributes,
    featured: Boolean(row.featured),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return res.status(403).json({ error: "A same-origin request is required." });
  try {
    if (new URL(origin).host !== req.get("host")) {
      return res.status(403).json({ error: "Cross-origin changes are not allowed." });
    }
  } catch {
    return res.status(403).json({ error: "The request origin is invalid." });
  }
  next();
}

function createApp(pool) {
  fs.mkdirSync(productImageDirectory, { recursive: true });
  const app = express();
  app.disable("x-powered-by");
  if (process.env.NODE_ENV === "production" || isVercel) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
  if (typeof pool.initialize === "function") {
    app.use((req, res, next) => {
      pool.initialize().then(() => next(), next);
    });
  }
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32kb", strict: true }));
  const imageUpload = multer({
    storage: multer.diskStorage({
      destination: productImageDirectory,
      filename(req, file, callback) {
        const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
        callback(null, `${crypto.randomUUID()}${extensions[file.mimetype] || ".invalid"}`);
      }
    }),
    limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE, files: MAX_PRODUCT_IMAGES },
    fileFilter(req, file, callback) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
        callback(new Error("Upload product photos as JPG, PNG, or WebP images."));
        return;
      }
      callback(null, true);
    }
  });
  const receiveProductImages = (req, res, next) => {
    imageUpload.array("images", MAX_PRODUCT_IMAGES)(req, res, (error) => {
      if (error) {
        removeUploadedImages(req.files || []).catch((cleanupError) => {
          console.error("Could not remove incomplete product photo uploads.", cleanupError);
        });
        if (error instanceof multer.MulterError) {
          const message = error.code === "LIMIT_FILE_SIZE"
            ? "Each product photo must be 3 MB or smaller."
            : `Upload at most ${MAX_PRODUCT_IMAGES} product photos at a time.`;
          res.status(400).json({ error: message });
          return;
        }
        res.status(400).json({ error: error.message || "Product photo upload failed." });
        return;
      }
      const uploadSize = (req.files || []).reduce((total, file) => total + file.size, 0);
      if (uploadSize > MAX_PRODUCT_UPLOAD_SIZE) {
        removeUploadedImages(req.files || []).catch((cleanupError) => {
          console.error("Could not remove oversized product photo uploads.", cleanupError);
        });
        res.status(400).json({ error: "Product photos must total 4 MB or less per save." });
        return;
      }
      next();
    });
  };

  function createLoginLimiter() {
    const windowMs = 15 * 60 * 1000;
    return rateLimit({
      windowMs,
      limit: 10,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      handler(req, res) {
        const resetTime = req.rateLimit && req.rateLimit.resetTime;
        const waitMs = resetTime instanceof Date ? resetTime.getTime() - Date.now() : windowMs;
        const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));
        res.set("Retry-After", String(retryAfterSeconds));
        res.status(429).json({
          error: "Too many sign-in attempts. Please wait before trying again.",
          retryAfterSeconds
        });
      }
    });
  }
  const adminLoginLimiter = createLoginLimiter();
  const customerLoginLimiter = createLoginLimiter();

  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many account registration attempts. Please try again later." }
  });

  async function requireAdmin(req, res, next) {
    const token = getCookie(req, SESSION_COOKIE);
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(401).json({ error: "Admin sign-in is required." });
    }
    try {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const [rows] = await pool.execute(
        `SELECT u.id, u.name, u.email
         FROM admin_sessions s
         INNER JOIN admin_users u ON u.id = s.admin_id
         WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
         LIMIT 1`,
        [tokenHash]
      );
      if (!rows.length) return res.status(401).json({ error: "Admin sign-in is required." });
      req.admin = rows[0];
      next();
    } catch (error) {
      next(error);
    }
  }

  async function getCustomer(req) {
    const token = getCookie(req, CUSTOMER_SESSION_COOKIE);
    if (!/^[a-f0-9]{64}$/i.test(token)) return null;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email
       FROM customer_sessions s
       INNER JOIN customers u ON u.id = s.customer_id
       WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [tokenHash]
    );
    return rows[0] || null;
  }

  async function createCustomerSession(customer, res) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    await pool.execute(
      "INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, ?)",
      [tokenHash, customer.id, expiresAt]
    );
    writeSessionCookie(res, CUSTOMER_SESSION_COOKIE, token);
  }

  async function requireSignedInSite(req, res, next) {
    try {
      const adminToken = getCookie(req, SESSION_COOKIE);
      if (/^[a-f0-9]{64}$/i.test(adminToken)) {
        const adminTokenHash = crypto.createHash("sha256").update(adminToken).digest("hex");
        const [admins] = await pool.execute(
          "SELECT 1 FROM admin_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1",
          [adminTokenHash]
        );
        if (admins.length) return next();
      }
      if (await getCustomer(req)) return next();
      return res.redirect(302, "/login.html");
    } catch (error) {
      next(error);
    }
  }

  app.get("/", (req, res) => res.redirect(302, "/login.html"));

  app.get("/healthz", async (req, res, next) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/products", async (req, res, next) => {
    try {
      const [rows] = await pool.query("SELECT * FROM products WHERE active = TRUE ORDER BY id DESC");
      res.json({ products: rows.map(productFromRow) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/collections", async (req, res, next) => {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM collections WHERE active = TRUE ORDER BY featured DESC, sort_order ASC, id ASC"
      );
      res.json({ collections: rows.map(collectionFromRow) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/login", adminLoginLimiter, requireSameOrigin, async (req, res, next) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!password || password.length > 1024) {
      return res.status(400).json({ error: "Password is required and must be at most 1024 characters." });
    }
    try {
      const [rows] = await pool.execute(
        "SELECT id, name, email, password_hash FROM admin_users WHERE email = ? LIMIT 1",
        [email]
      );
      const admin = rows[0];
      if (!admin || !verifyPassword(password, admin.password_hash)) {
        return res.status(401).json({ error: "Email or password is incorrect." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
      await pool.execute(
        "INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)",
        [tokenHash, admin.id, expiresAt]
      );
      setSessionCookie(res, token);
      res.json({ user: { id: String(admin.id), name: admin.name, email: admin.email } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/customer/register", registrationLimiter, requireSameOrigin, async (req, res, next) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!name || name.length > 100) return res.status(400).json({ error: "Enter your name (up to 100 characters)." });
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (password.length < 12 || password.length > 1024) {
      return res.status(400).json({ error: "Choose a password with at least 12 characters." });
    }

    try {
      const [admins] = await pool.execute("SELECT id FROM admin_users WHERE email = ? LIMIT 1", [email]);
      if (admins.length) return res.status(409).json({ error: "This email address is already in use." });
      const [result] = await pool.execute(
        "INSERT INTO customers (name, email, password_hash) VALUES (?, ?, ?)",
        [name, email, hashPassword(password)]
      );
      const customer = { id: String(result.insertId), name, email };
      await createCustomerSession(customer, res);
      res.status(201).json({ user: customer, role: "customer" });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This email address is already registered." });
      next(error);
    }
  });

  app.post("/api/customer/login", customerLoginLimiter, requireSameOrigin, async (req, res, next) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!isValidEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (!password || password.length > 1024) {
      return res.status(400).json({ error: "Password is required and must be at most 1024 characters." });
    }
    try {
      const [rows] = await pool.execute(
        "SELECT id, name, email, password_hash FROM customers WHERE email = ? LIMIT 1",
        [email]
      );
      const customer = rows[0];
      if (!customer || !verifyPassword(password, customer.password_hash)) {
        return res.status(401).json({ error: "Email or password is incorrect." });
      }
      const user = { id: String(customer.id), name: customer.name, email: customer.email };
      await createCustomerSession(customer, res);
      res.json({ user, role: "customer" });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/customer/session", async (req, res, next) => {
    try {
      const customer = await getCustomer(req);
      if (!customer) return res.status(401).json({ error: "Customer sign-in is required." });
      res.json({ user: { id: String(customer.id), name: customer.name, email: customer.email }, role: "customer" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/customer/logout", requireSameOrigin, async (req, res, next) => {
    const token = getCookie(req, CUSTOMER_SESSION_COOKIE);
    try {
      if (/^[a-f0-9]{64}$/i.test(token)) {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        await pool.execute("DELETE FROM customer_sessions WHERE token_hash = ?", [tokenHash]);
      }
      clearNamedSessionCookie(res, CUSTOMER_SESSION_COOKIE);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/session", requireAdmin, (req, res) => {
    res.json({ user: { id: String(req.admin.id), name: req.admin.name, email: req.admin.email } });
  });

  app.post("/api/admin/logout", requireSameOrigin, async (req, res, next) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (/^[a-f0-9]{64}$/i.test(token)) {
      try {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        await pool.execute("DELETE FROM admin_sessions WHERE token_hash = ?", [tokenHash]);
      } catch (error) {
        return next(error);
      }
    }
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get("/api/admin/collections", requireAdmin, async (req, res, next) => {
    try {
      const [rows] = await pool.query("SELECT * FROM collections ORDER BY sort_order ASC, id ASC");
      res.json({ collections: rows.map(collectionFromRow) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/admin/products", requireAdmin, async (req, res, next) => {
    try {
      const [rows] = await pool.query("SELECT * FROM products ORDER BY id DESC");
      res.json({ products: rows.map(productFromRow) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/products", requireSameOrigin, requireAdmin, receiveProductImages, async (req, res, next) => {
    const files = req.files || [];
    let productPersisted = false;
    try {
      const body = parseJsonField(req.body.product, "Product details");
      const existingImages = parseJsonField(req.body.existingImages || "[]", "Product images");
      if (!Array.isArray(existingImages)) {
        await removeUploadedImages(files);
        return res.status(400).json({ error: "Product image list must be an array." });
      }
      if (existingImages.length) {
        await removeUploadedImages(files);
        return res.status(400).json({ error: "A new product cannot keep photos from another product." });
      }
      for (const file of files) {
        if (!await validateImageFile(file)) {
          await removeUploadedImages(files);
          return res.status(400).json({ error: "One of the uploaded files is not a valid JPG, PNG, or WebP image." });
        }
      }
      await persistUploadedImages(files);
      const result = validateProductInput(body, existingImages, files);
      if (result.error) {
        await removeUploadedImages(files);
        return res.status(400).json({ error: result.error });
      }
      const product = result.value;
      const [insert] = await pool.execute(
        `INSERT INTO products
          (name, name_mr, description, description_mr, category, category_mr, price,
           discount_price, images, sizes, colors, stock, active, whatsapp_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.name, product.nameMr, product.description, product.descriptionMr,
          product.category, product.categoryMr, product.price, product.discountPrice,
          JSON.stringify(product.images), JSON.stringify(product.sizes),
          JSON.stringify(product.colors), product.stock, product.active, product.whatsappMessage
        ]
      );
      productPersisted = true;
      const [rows] = await pool.execute("SELECT * FROM products WHERE id = ?", [insert.insertId]);
      res.status(201).json({ product: productFromRow(rows[0]) });
    } catch (error) {
      if (!productPersisted) await removeUploadedImages(files);
      if (error instanceof Error && /must be JSON|valid JSON/.test(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.put("/api/admin/products/:id", requireSameOrigin, requireAdmin, receiveProductImages, async (req, res, next) => {
    const id = Number(req.params.id);
    const files = req.files || [];
    let productPersisted = false;
    if (!Number.isSafeInteger(id) || id < 1) {
      await removeUploadedImages(files);
      return res.status(400).json({ error: "Product ID is invalid." });
    }

    try {
      const body = parseJsonField(req.body.product, "Product details");
      const existingImages = parseJsonField(req.body.existingImages || "[]", "Product images");
      if (!Array.isArray(existingImages)) {
        await removeUploadedImages(files);
        return res.status(400).json({ error: "Product image list must be an array." });
      }
      const [previousRows] = await pool.execute("SELECT * FROM products WHERE id = ?", [id]);
      if (!previousRows.length) {
        await removeUploadedImages(files);
        return res.status(404).json({ error: "Product was not found." });
      }
      const previousImages = previousRows[0].images;
      if (existingImages.some((image) => !previousImages.includes(image))) {
        await removeUploadedImages(files);
        return res.status(400).json({ error: "Product photo list contains an image not attached to this product." });
      }
      for (const file of files) {
        if (!await validateImageFile(file)) {
          await removeUploadedImages(files);
          return res.status(400).json({ error: "One of the uploaded files is not a valid JPG, PNG, or WebP image." });
        }
      }
      await persistUploadedImages(files);
      const result = validateProductInput(body, existingImages, files);
      if (result.error) {
        await removeUploadedImages(files);
        return res.status(400).json({ error: result.error });
      }
      const product = result.value;
      await pool.execute(
        `UPDATE products SET name = ?, name_mr = ?, description = ?, description_mr = ?,
          category = ?, category_mr = ?, price = ?, discount_price = ?, images = ?,
          sizes = ?, colors = ?, stock = ?, active = ?, whatsapp_message = ? WHERE id = ?`,
        [
          product.name, product.nameMr, product.description, product.descriptionMr,
          product.category, product.categoryMr, product.price, product.discountPrice,
          JSON.stringify(product.images), JSON.stringify(product.sizes),
          JSON.stringify(product.colors), product.stock, product.active, product.whatsappMessage, id
        ]
      );
      productPersisted = true;
      const [rows] = await pool.execute("SELECT * FROM products WHERE id = ?", [id]);
      await removeProductImages(previousImages.filter((image) => !product.images.includes(image)));
      res.json({ product: productFromRow(rows[0]) });
    } catch (error) {
      if (!productPersisted) await removeUploadedImages(files);
      if (error instanceof Error && /must be JSON|valid JSON/.test(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.delete("/api/admin/products/:id", requireSameOrigin, requireAdmin, async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Product ID is invalid." });
    try {
      const [rows] = await pool.execute("SELECT images FROM products WHERE id = ?", [id]);
      if (!rows.length) return res.status(404).json({ error: "Product was not found." });
      await pool.execute("DELETE FROM products WHERE id = ?", [id]);
      await removeProductImages(rows[0].images);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/collections", requireSameOrigin, requireAdmin, async (req, res, next) => {
    const result = validateCollectionInput(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    try {
      const data = result.value;
      const [insert] = await pool.execute(
        `INSERT INTO collections
          (slug, name, name_mr, category, category_mr, description, description_mr, cover_image,
           sort_order, attributes, featured, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          slugify(data.name), data.name, data.nameMr, data.category, data.categoryMr,
          data.description, data.descriptionMr, data.coverImage, data.sortOrder,
          JSON.stringify(data.attributes), data.featured, data.active
        ]
      );
      const [rows] = await pool.execute("SELECT * FROM collections WHERE id = ?", [insert.insertId]);
      res.status(201).json({ collection: collectionFromRow(rows[0]) });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A collection with this name already exists." });
      next(error);
    }
  });

  app.put("/api/admin/collections/:id", requireSameOrigin, requireAdmin, async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Collection ID is invalid." });
    const result = validateCollectionInput(req.body);
    if (result.error) return res.status(400).json({ error: result.error });

    try {
      const data = result.value;
      const [update] = await pool.execute(
        `UPDATE collections SET slug = ?, name = ?, name_mr = ?, category = ?, category_mr = ?,
          description = ?, description_mr = ?, cover_image = ?, sort_order = ?, attributes = ?,
          featured = ?, active = ? WHERE id = ?`,
        [
          slugify(data.name), data.name, data.nameMr, data.category, data.categoryMr,
          data.description, data.descriptionMr, data.coverImage, data.sortOrder,
          JSON.stringify(data.attributes), data.featured, data.active, id
        ]
      );
      if (!update.affectedRows) return res.status(404).json({ error: "Collection was not found." });
      const [rows] = await pool.execute("SELECT * FROM collections WHERE id = ?", [id]);
      res.json({ collection: collectionFromRow(rows[0]) });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A collection with this name already exists." });
      next(error);
    }
  });

  app.delete("/api/admin/collections/:id", requireSameOrigin, requireAdmin, async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: "Collection ID is invalid." });
    try {
      const [result] = await pool.execute("DELETE FROM collections WHERE id = ?", [id]);
      if (!result.affectedRows) return res.status(404).json({ error: "Collection was not found." });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "API endpoint was not found." }));

  app.get(["/index.html", "/shop.html", "/cart.html", "/contact.html", "/custom-design.html"], requireSignedInSite, (req, res, next) => {
    res.sendFile(path.join(__dirname, path.basename(req.path)), (error) => {
      if (error) next(error);
    });
  });
  if (!isVercel) {
    app.use("/uploads/products", express.static(productImageDirectory, { fallthrough: false, index: false, dotfiles: "deny" }));
  }
  app.use((req, res, next) => {
    const publicFiles = /^\/(?:login\.html|admin\.html|script\.js|catalog\.js|cart\.js|contact\.js|custom-studio\.js|admin\.js|login\.js|styles\.css|assets\/[a-z0-9_-]+\.(?:svg|png|jpe?g|webp|woff2?))$/i;
    if (req.path !== "/" && !publicFiles.test(req.path)) return res.sendStatus(404);
    next();
  });
  app.use(express.static(publicDirectory, { dotfiles: "deny" }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.status === 404 && req.path.startsWith("/uploads/products/")) return res.sendStatus(404);
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return res.status(400).json({ error: "Request body must be valid JSON." });
    }
    console.error("NK Design request failed.", error);
    res.status(500).json({ error: "The request could not be completed." });
  });

  return app;
}

function createDatabasePool() {
  return mysql.createPool({
    host: requiredEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    database: requiredEnv("DB_NAME"),
    user: requiredEnv("DB_USER"),
    password: process.env.DB_PASSWORD || "",
    ssl: process.env.DB_SSL === "true"
      ? {
          rejectUnauthorized: true,
          ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {})
        }
      : undefined,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || (isVercel ? 5 : 10)),
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z"
  });
}

async function initializeDatabase(pool) {
  try {
    await pool.query("SELECT 1");
    await createTables(pool);
    await bootstrapAdmin(pool);
    await pool.execute("DELETE FROM admin_sessions WHERE expires_at <= UTC_TIMESTAMP()");
  } catch (error) {
    throw new Error(`Could not prepare the NK Design database: ${error.message}`, { cause: error });
  }
}

async function startServer() {
  const pool = createDatabasePool();
  try {
    await initializeDatabase(pool);
  } catch (error) {
    await pool.end();
    throw error;
  }

  const app = createApp(pool);
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port);
  server.on("listening", () => console.log(`NK Design is available at http://localhost:${port}`));
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. NK Design may already be running at http://localhost:${port}.`);
    } else {
      console.error("Could not start the NK Design web server.", error);
    }
    pool.end().catch((poolError) => console.error("Could not close the MySQL connection pool.", poolError));
    process.exitCode = 1;
  });
  const shutdown = () => server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  createApp,
  createDatabasePool,
  createTables,
  hashPassword,
  initializeDatabase,
  isValidEmail,
  isProductImageUrl,
  productFromRow,
  slugify,
  validateCollectionInput,
  validateProductInput,
  verifyPassword
};

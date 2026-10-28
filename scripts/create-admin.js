require("dotenv").config();

const mysql = require("mysql2/promise");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { createTables, hashPassword } = require("../server");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing ${name} in the local .env file.`);
  return value.trim();
}

function readHidden(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command in an interactive terminal so the password can be entered privately."));
  }

  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    function finish(error) {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish(new Error("Admin setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " " && character !== "\u007f") {
          value += character;
          stdout.write("*");
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function createOrUpdateAdmin(pool, account, { replaceExisting = false } = {}) {
  const connection = await pool.getConnection();
  let lockAcquired = false;
  let transactionStarted = false;

  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", ["nk-design-admin-create"]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) throw new Error("Another admin setup is in progress. Please try again.");

    await connection.beginTransaction();
    transactionStarted = true;
    const [admins] = await connection.query("SELECT id, email FROM admin_users FOR UPDATE");
    if (admins.length > 1) {
      throw new Error("Multiple admin accounts already exist. Remove the extras before using this single-admin setup command.");
    }

    const [customers] = await connection.execute(
      "SELECT id FROM customers WHERE email = ? LIMIT 1",
      [account.email]
    );
    if (customers.length) throw new Error("That email is already registered as a customer. Use a different admin email.");

    const passwordHash = hashPassword(account.password);
    let action;
    if (!admins.length) {
      await connection.execute(
        "INSERT INTO admin_users (name, email, password_hash) VALUES (?, ?, ?)",
        [account.name, account.email, passwordHash]
      );
      action = "created";
    } else if (admins[0].email.toLowerCase() === account.email) {
      await connection.execute(
        "UPDATE admin_users SET name = ?, password_hash = ? WHERE id = ?",
        [account.name, passwordHash, admins[0].id]
      );
      action = "updated";
    } else if (replaceExisting) {
      await connection.execute("DELETE FROM admin_users WHERE id = ?", [admins[0].id]);
      await connection.execute(
        "INSERT INTO admin_users (name, email, password_hash) VALUES (?, ?, ?)",
        [account.name, account.email, passwordHash]
      );
      action = "replaced";
    } else {
      throw new Error(`An admin account already exists (${admins[0].email}). Use the same email to update it, or run npm run admin:create -- --replace to replace it.`);
    }

    await connection.commit();
    transactionStarted = false;
    return action;
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    if (lockAcquired) await connection.query("SELECT RELEASE_LOCK(?)", ["nk-design-admin-create"]);
    connection.release();
  }
}

async function main() {
  const pool = mysql.createPool({
    host: requiredEnv("DB_HOST"),
    port: Number(process.env.DB_PORT || 3306),
    database: requiredEnv("DB_NAME"),
    user: requiredEnv("DB_USER"),
    password: process.env.DB_PASSWORD || "",
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "Z"
  });
  const prompt = readline.createInterface({ input: stdin, output: stdout });

  try {
    await pool.query("SELECT 1");
    await createTables(pool);

    const replaceExisting = process.argv.includes("--replace");
    const name = (await prompt.question("Admin name: ")).trim();
    const email = (await prompt.question("Admin email: ")).trim().toLowerCase();
    if (!name || name.length > 100) throw new Error("Name is required and must be 100 characters or fewer.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      throw new Error("Enter a valid email address (254 characters or fewer).");
    }

    if (replaceExisting) {
      const confirmationText = (await prompt.question("Replace the existing admin login? Customer accounts and collections will be preserved. Type REPLACE to confirm: ")).trim();
      if (confirmationText !== "REPLACE") throw new Error("Admin replacement was not confirmed. No changes were made.");
    }

    prompt.close();
    const password = await readHidden("Admin password (minimum 12 characters): ");
    const confirmation = await readHidden("Confirm admin password: ");
    if (password.length < 12 || password.length > 1024) {
      throw new Error("Password must contain at least 12 characters.");
    }
    if (password !== confirmation) throw new Error("Passwords do not match.");

    const action = await createOrUpdateAdmin(pool, { name, email, password }, { replaceExisting });
    console.log(`Admin account ${action} successfully for ${email}.`);
    console.log("The password was stored securely and was not displayed.");
  } finally {
    prompt.close();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Admin setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createOrUpdateAdmin };

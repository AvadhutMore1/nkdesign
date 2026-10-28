# NK Design

The storefront serves live collections from MySQL. The site opens on a shared sign-in page: the bootstrap admin account goes to the admin dashboard, and customers can register for an account or sign in to browse the storefront.

## Run locally

1. Install Node.js 20 or newer and MySQL 8.
2. Create a database and a dedicated application user. Avoid using MySQL's `root` account for the website:

   ```sql
   CREATE DATABASE nk_design CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'nk_design_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES ON nk_design.* TO 'nk_design_app'@'localhost';
   ```

3. Copy `.env.example` to `.env`, then set the MySQL connection values and a unique admin email/password. Set `ADMIN_PASSWORD` to a strong password of at least 12 characters.
4. Install dependencies and start the site:

  ```powershell
   Copy-Item .env.example .env
   npm install
   npm start
   ```

5. Open `http://localhost:3000`. Sign in with the bootstrap admin credentials to open the dashboard, or create a customer account to visit the storefront.

The server creates the required tables automatically. The admin dashboard can add, edit, publish, and delete products, including up to five JPG, PNG, or WebP photos per product. Photo uploads are limited to 3 MB per photo and 4 MB total per save. The server verifies image signatures and generates its own filenames. Locally, photos are stored in `uploads/products/`; on Vercel, they are stored in Vercel Blob.

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used to create the first admin when `admin_users` is empty; changing those environment values later does not reset an existing account. Admin and customer sessions are stored in MySQL, use separate HTTP-only same-site cookies, and expire after eight hours. Customers need an account to visit storefront pages. In production, serve the site over HTTPS and set `NODE_ENV=production`.

To create the single admin account or change its password from an interactive terminal, run `npm run admin:create`. Enter the admin name, email, and password when prompted. Password characters are masked and the password is never printed. If an admin already exists, enter the same email to update that account. To replace the existing admin with a different email, run `npm run admin:create -- --replace`, then type `REPLACE` when prompted to confirm. Replacement deletes the old admin login and its sessions, but preserves customer accounts and collections.

The storefront reads active products and collections from MySQL. Orders and design requests are still presentation/integration surfaces and need their own data model and workflows before they can be managed through this service.

## Deploy to Vercel

The project is configured for Vercel's Express runtime. Vercel serves files from `public/`; authenticated storefront pages remain outside that directory and are served through Express after session checks. The Node function prepares the MySQL schema on its first request and reuses a connection pool while warm.

1. Import `https://github.com/AvadhutMore1/nkdesign` into Vercel, deploy the `main` branch, and keep the Express framework preset/default build settings.
2. Create or connect a MySQL 8 database reachable from Vercel. Add `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` to the Vercel project's Production environment. Use a provider's TLS settings where available (`DB_SSL=true` and, if required, `DB_SSL_CA`).
3. Add `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique strong `ADMIN_PASSWORD` of at least 12 characters as Production environment variables. These bootstrap the initial admin only if the database has no admin account. Never use the example credentials.
4. In the Vercel project, create and connect a **public Vercel Blob store**. Vercel adds its Blob credentials to the project; the admin product uploader uses Blob for durable product photos. Do not expose Blob tokens in browser code or commit them.
5. Redeploy after setting environment variables and connecting storage. Open the Vercel URL, sign in, and verify the admin dashboard and storefront.

Vercel's production database starts separately from local development: local accounts, collections, products, and photos are not copied automatically. Migrate your MySQL data and re-upload product photos before directing customers to the new site. Back up the database and Blob store independently. Orders and design requests still require their own backend workflows.
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

The server creates the required tables automatically. The admin dashboard can add, edit, publish, and delete products, including uploading up to five JPG, PNG, or WebP photos per product (5 MB maximum per photo). Product images are stored in the local `uploads/products/` directory, so keep that directory persistent and include it in your backups when deploying. The server verifies image signatures and generates its own filenames.

`ADMIN_EMAIL` and `ADMIN_PASSWORD` are only used to create the first admin when `admin_users` is empty; changing those environment values later does not reset an existing account. Admin and customer sessions are stored in MySQL, use separate HTTP-only same-site cookies, and expire after eight hours. Customers need an account to visit storefront pages. In production, serve the site over HTTPS and set `NODE_ENV=production`.

To create the single admin account or change its password from an interactive terminal, run `npm run admin:create`. Enter the admin name, email, and password when prompted. Password characters are masked and the password is never printed. If an admin already exists, enter the same email to update that account. To replace the existing admin with a different email, run `npm run admin:create -- --replace`, then type `REPLACE` when prompted to confirm. Replacement deletes the old admin login and its sessions, but preserves customer accounts and collections.

The storefront reads active products and collections from MySQL. Orders and design requests are still presentation/integration surfaces and need their own data model and workflows before they can be managed through this service.

## Prepare a Render deployment

The repository includes a Render Blueprint in `render.yaml`. It configures the Node web service, a database-backed `/healthz` check, and a persistent disk mounted for product photos. The service is configured on Render's Starter plan because its persistent disk is not available on the free web-service plan. Review current Render pricing before creating resources; this project has not been deployed and no hosting resources have been created.

Before deploying:

1. Put the project in a GitHub repository and connect that repository to Render. Do not commit `.env`, passwords, or database exports.
2. Create a production MySQL 8 database with a dedicated application user. Configure its network access to allow the Render service to connect. Set the Blueprint's `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` environment variables in Render. For providers that support TLS, keep `DB_SSL=true`; if the provider requires a custom CA certificate, set `DB_SSL_CA` to the certificate contents.
3. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique, strong `ADMIN_PASSWORD` (at least 12 characters) as Render environment variables. These values bootstrap the initial admin only when the production database has no admin account. Never reuse a sample or local development password.
4. Review the Blueprint, confirm the plan and disk cost, then create the Render resources. The app creates its database tables on startup. Render assigns the public `onrender.com` URL; HTTPS is provided by the platform.
5. After deployment, open the URL, sign in with the production admin account, and verify product and collection pages.

The production database is separate from the local MySQL database. Deploying does not copy local customer accounts, collections, products, or uploaded photos. Export/import the database and copy or re-upload product photos as a separate, backed-up migration before switching customers to the live site. The persistent disk stores uploaded files, but it is not a backup.

To run the Blueprint with a free web service instead, remove the disk and choose the free plan only for a temporary demo: local uploads can be lost when the service restarts or redeploys. The database still needs to be hosted separately and kept persistent.
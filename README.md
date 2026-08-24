# Vchecker

Vchecker is a Next.js application using MySQL through Drizzle ORM. It can run locally with XAMPP or online as a Node.js application in CyberPanel.

## Requirements

- Node.js 20.9 or newer (Node.js 22 is recommended)
- MySQL 8 or MariaDB
- A domain or subdomain for the online installation

## Local setup

1. Start MySQL in the XAMPP Control Panel.
2. Create a database named `app_db` in phpMyAdmin.
3. Copy `.env.local.example` to `.env.local`.
4. Update `DATABASE_URL` if your MySQL password is not blank.
5. Install dependencies and create the tables:

   ```bash
   npm install
   npm run db:push
   ```

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

Example local connection string:

```text
mysql://root:YOUR_PASSWORD@127.0.0.1:3306/app_db
```

## CyberPanel deployment

The instructions below assume a CyberPanel server with OpenLiteSpeed and a Node.js application manager.

### 1. Create the site and database

1. In CyberPanel, create the website and attach the domain or subdomain.
2. Enable SSL for the domain using **SSL > Manage SSL** after DNS points to the server.
3. Create a MySQL database and a dedicated database user in CyberPanel.
4. Grant the user full access to the new database.
5. Record the database name, username, password, host, and port. Do not use the local XAMPP `root` account online.

### 2. Upload the application

Upload the project files to the website application directory using Git, SFTP, or the CyberPanel file manager. Do not upload `.env.local`, unless it contains only the production values, and do not rely on the local `node_modules` folder.

Open **Terminal** in CyberPanel or connect through SSH, then run from the project directory:

```bash
npm install
```

### 3. Configure production environment variables

Create `.env.production` in the project directory, or add these variables in the CyberPanel Node.js application environment settings:

```env
NODE_ENV=production
DATABASE_URL=mysql://DB_USER:DB_PASSWORD@127.0.0.1:3306/DB_NAME
AUTH_SECRET=GENERATE_A_LONG_RANDOM_SECRET
```

Generate a secret on the server with:

```bash
openssl rand -base64 48
```

Keep `AUTH_SECRET` private. Changing it will invalidate existing login sessions.

### 4. Create the production tables

Run this once after setting `DATABASE_URL`:

```bash
npm run db:push
```

Do not run this against the wrong database. Confirm the database name before continuing. The initial setup page creates the first Super Admin account when the database has no users.

### 5. Build the application

```bash
npm run build
```

This project uses Next.js standalone output. The build creates `.next/standalone/server.js`. Copy the static assets into the standalone directory:

```bash
cp -r .next/static .next/standalone/.next/
if [ -d public ]; then cp -r public .next/standalone/; fi
```

### 6. Create the CyberPanel Node.js application

In CyberPanel, create a Node.js app with:

- **Node version:** 20 or newer
- **Application root:** the project directory
- **Startup file:** `.next/standalone/server.js`
- **Application URL:** the deployed domain or subdomain
- **Application port:** the port assigned by CyberPanel

Add the production environment variables from step 3, then start or restart the application. The standalone server reads the `PORT` value provided by CyberPanel; do not hardcode a public port in the app.

### 7. Verify the deployment

1. Open the HTTPS domain in a private browser window.
2. Complete the initial setup and create the Super Admin account.
3. Add one test student, record a test violation, log out, and log in again.
4. Confirm that the browser address uses `https://` and that login persists after a page refresh.
5. Remove test records only after confirming the production database is correct.

## Updating an existing deployment

From the project directory on the server:

```bash
git pull
npm install
npm run db:push
npm run build
cp -r .next/static .next/standalone/.next/
if [ -d public ]; then cp -r public .next/standalone/; fi
```

Restart the Node.js application in CyberPanel after the build. Back up the MySQL database before schema changes or application updates.

## Important security notes

- Use a dedicated MySQL user with a strong password.
- Use a long, random `AUTH_SECRET` in production.
- Keep `.env.production` out of Git and never share it publicly.
- Use HTTPS before sharing the system with staff.
- Schedule regular MySQL backups in CyberPanel or your hosting provider.

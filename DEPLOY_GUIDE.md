# Deploying Vchecker on CyberPanel - Beginner Guide (No Docker)

> **App:** Vchecker - Next.js 16.2.6 + React 19 + Drizzle ORM + MySQL 8
> **Server:** CyberPanel with OpenLiteSpeed + PM2 (no Docker)
> **Deploy:** GitHub Actions -> SCP upload -> PM2 `127.0.0.1:3005`
> **Tested:** 2026-08-24 on `vmi2682266` with this repo

If this is your first time deploying, follow steps **in order**. Each step has a check `✅` so you know it worked.

---

## Table of Contents

1. [How it works (simple picture)](#1-how-it-works)
2. [What you need](#2-what-you-need)
3. [Step 1 - Create website in CyberPanel](#step-1---create-website-in-cyberpanel)
4. [Step 2 - Create database](#step-2---create-database)
5. [Step 3 - Create secret file (.env)](#step-3---create-secret-file-env)
6. [Step 4 - Upload code](#step-4---upload-code)
7. [Step 5 - Install and build](#step-5---install-and-build)
8. [Step 6 - Start with PM2](#step-6---start-with-pm2)
9. [Step 7 - Connect CyberPanel proxy (vHost)](#step-7---connect-cyberpanel-proxy-vhost)
10. [Step 8 - Turn on SSL (https)](#step-8---turn-on-ssl-https)
11. [Step 9 - Auto deploy with GitHub](#step-9---auto-deploy-with-github)
12. [Step 10 - Check if everything works](#step-10---check-if-everything-works)
13. [Updating later](#updating-later)
14. [Troubleshooting](#troubleshooting)
15. [AI Help - When you are stuck](#ai-help---when-you-are-stuck)

---

## 1. How it works

```
Your browser (https://yourdomain.com)
      |
      v
CyberPanel (OpenLiteSpeed on port 443)
      |
      v  proxy to
127.0.0.1:3005  <- PM2 runs ".next/standalone/server.js" (Next.js)
      |
      v
MySQL database (127.0.0.1:3306) - tables: users, students, violations, logs, settings
```

*   **No Docker.** Only PM2 keeps the app running.
*   GitHub Actions does `SCP upload -> npm ci -> npm run build -> pm2 reload` automatically when you push to `main`.

---

## 2. What you need

*   Domain already pointed to your CyberPanel server (A record)
*   CyberPanel login (admin)
*   This GitHub repo `rajjmanuel/vchecker` cloned
*   Server has: Node.js 20.11+ (we use 20.11.1, 22 is better), `npm`, `pm2` (we install it for you), MySQL 8 or MariaDB 10.11

Check on server (SSH: `ssh USER@YOUR_SERVER_IP`, then `cd` to your path):
```bash
node -v   # should be v20.11.1 or higher
npm -v
mysql --version
```

---

## Step 1 - Create website in CyberPanel

1.  Login CyberPanel -> **Websites > Create Website**
2.  Package: `Default`, Owner: your user, Domain: `yourdomain.com`, Email: yours, PHP: any (not used)
3.  Click **Create Website**
4.  Note the folder path - e.g. `/home/yourdomain.com/vchecker` - this is your **DEPLOY_PATH**. You need it for GitHub Secrets later.

> [Screenshot placeholder: Create Website form]

---

## Step 2 - Create database

1.  CyberPanel -> **Databases > Create Database**
2.  Database name: `vche_db` (or `vchecker`), User: `vche_user`, Password: make strong (32 chars, save it!)
3.  Access Host: `localhost` or `127.0.0.1`
4.  Create -> Test:
```bash
mysql -u vche_user -p -h 127.0.0.1 -e "SHOW DATABASES;" # enter password
```

**Save this line** (replace with your real password):
```
DATABASE_URL=mysql://vche_user:YOUR_PASSWORD@127.0.0.1:3306/vche_db
```

---

## Step 3 - Create secret file (.env)

On server, go to your app folder:
```bash
cd /home/yourdomain.com/vchecker   # your DEPLOY_PATH
```

Create `.env.production`:
```bash
nano .env.production
```

Paste (replace):
```env
NODE_ENV=production
DATABASE_URL=mysql://vche_user:YOUR_PASSWORD@127.0.0.1:3306/vche_db
AUTH_SECRET=PASTE_A_LONG_RANDOM_STRING_HERE
```

Generate random secret on server:
```bash
openssl rand -base64 48
```
Copy output and paste as `AUTH_SECRET`.

Save: `Ctrl+O` -> Enter -> `Ctrl+X`

> ⚠️ Never put `.env.production` in GitHub. It is ignored by `.gitignore`.

Check:
```bash
cat .env.production
```

---

## Step 4 - Upload code

**First time only** (choose one):

*   **Option A - Git clone (simple):**
    ```bash
    cd /home/yourdomain.com
    git clone https://github.com/rajjmanuel/vchecker vchecker
    cd vchecker
    ```

*   **Option B - GitHub Actions auto (recommended after first time):**
    Push to `main` on GitHub -> Actions will `SCP` these folders: `src, drizzle, public, package.json, package-lock.json, next.config.ts, drizzle.config.ts, tsconfig.json, postcss.config.mjs, eslint.config.mjs, .github, README.md` to `DEPLOY_PATH`. Server keeps its `.env` (not uploaded).

For now, if you used `git clone`, you are done. If you will use Actions, you still need the repo cloned once.

---

## Step 5 - Install and build

On server `cd /home/yourdomain.com/vchecker`:

```bash
npm ci
```

Wait 40 seconds. Warnings about `EBADENGINE` or `deprecated` are OK.

Create tables (only first time, or when `src/db/schema.ts` changes):
```bash
npx drizzle-kit push --force --verbose
# If error "already exists", it's OK - tables already there. Use --force to skip prompt.
```

Build Next.js standalone (creates `.next/standalone/server.js`):
```bash
npm run build
```

**Important fixups** (Next.js standalone needs these):
```bash
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/
if [ -d public ]; then cp -r public .next/standalone/; fi
cp .env.production .next/standalone/.env
```

Check:
```bash
ls -lh .next/standalone/server.js
ls -lh .next/standalone/.next/static
cat .next/standalone/.env | grep DATABASE_URL
```

---

## Step 6 - Start with PM2

We use **PM2** (not CyberPanel Node Manager). Do not create a Node app in CyberPanel UI for this domain, or you will have 2 managers fighting for port 3005.

On server:

```bash
# install pm2 to user folder (no sudo needed)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
npm install -g pm2
export PATH="$HOME/.npm-global/bin:$PATH"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.profile
pm2 --version
```

Start app:
```bash
PORT=3005 pm2 start .next/standalone/server.js --name vchecker
pm2 save
pm2 list
```

You should see `vchecker` `online` `fork` `818xxx`.

Test locally on server:
```bash
curl -I http://127.0.0.1:3005/api/health
# expect: HTTP/1.1 200 and {"ok":true}
```

Keep alive after reboot:
```bash
pm2 startup  # copy and run the command it prints (needs sudo once)
```

---

## Step 7 - Connect CyberPanel proxy (vHost)

This connects `https://yourdomain.com` -> `127.0.0.1:3005`.

1.  CyberPanel -> **Websites > List Websites > Manage > vHost Conf**
2.  Find the last `}` and **add before it** this block:

```apache
extprocessor vchecker {
  type                    proxy
  address                 127.0.0.1:3005
  maxConns                100
  initTimeout             60
  retryTimeout            0
  respBuffer              0
}

context / {
  type                    proxy
  handler                 vchecker
  addDefaultCharset       off
  extraHeaders            <<<END_extraHeaders
  X-Forwarded-For $client_ip
  X-Real-IP $client_ip
  X-Forwarded-Host $host
  X-Forwarded-Proto $scheme
  END_extraHeaders
  proxyWebSocket          on
  proxySSL                off
  proxyTimeout            60
  proxySetHost            on
  proxySetHeaders         on
  proxyKeepAliveTimeout   60
}
```

> **Why these names must match:** `extprocessor vchecker` defines a backend named `vchecker`. `context / { handler vchecker }` says “send `/` to `vchecker`”. If they differ (`handler backend`), you get `503`.

> For SSL renewal to work, also ensure this exists (CyberPanel often adds it):
```apache
context /.well-known/acme-challenge {
  location                $DOC_ROOT/.well-known/acme-challenge
  allowBrowse             1
}
```

3.  Click **Save**
4.  **Manage Services > LiteSpeed > Reload** (or SSH: `/usr/local/lsws/bin/lswsctrl reload`)
5.  Check no error: `tail -20 /usr/local/lsws/logs/error.log` -> no `unknown variable` or `invalid address`.

Test from your laptop:
```bash
curl -I https://yourdomain.com/api/health
```

**Port rule:** `3005` must be unique. If you run another app, give it `3006` and create `extprocessor other { address 127.0.0.1:3006 }`.

---

## Step 8 - Turn on SSL (https)

1.  CyberPanel -> **SSL > Manage SSL > Issue SSL** (Let's Encrypt) for your domain
2.  Enable **Force HTTPS**

Check: open `https://yourdomain.com` in private window -> lock icon -> no mixed content. Login cookie `src/lib/auth.ts` needs `https` in production.

---

## Step 9 - Auto deploy with GitHub

You already have `.github/workflows/deploy.yml` that does: `SCP upload -> npm ci -> db:migrate (fallback push --force) -> npm run build -> pm2 reload`.

**Secrets to set** (GitHub repo `rajjmanuel/vchecker` -> Settings -> Secrets and variables -> Actions -> New secret):

| Secret | Example | Required |
|---|---|---|
| `SSH_HOST` | `123.123.123.123` | Yes |
| `SSH_USERNAME` | `vchec_user` or `root` | Yes |
| `SSH_PASSWORD` | your ssh password | Yes if no key |
| `SSH_KEY` | private key content | Yes if no password |
| `SSH_PORT` | `22` | No (default 22) |
| `DEPLOY_PATH` | `/home/yourdomain.com/vchecker` | Yes |
| `PM2_APP_NAME` | `vchecker` | No (default vchecker) |
| `APP_PORT` | `3005` | No (default 3005) |

> **No Docker** needed. `DEPLOY_PATH` you noted in Step 1. `SSH_PASSWORD` vs `SSH_KEY` - use one.

After setting, push to `main`:
```bash
git add .
git commit -m "deploy"
git push origin main
```
Watch: GitHub -> Actions -> Deploy -> green check. Server does health `curl http://127.0.0.1:3005/api/health` -> `Health OK`.

Manual trigger: Actions -> Deploy -> Run workflow.

---

## Step 10 - Check if everything works

On server:
```bash
pm2 list          # vchecker online
ss -tlnp | grep 3005
curl http://127.0.0.1:3005/api/health  # {"ok":true}
cat .next/standalone/.env | grep NODE_ENV # production
```

In browser private window:
1.  Open `https://yourdomain.com` -> you see setup `Create Super Admin` (when DB `users` empty `src/app/api/bootstrap` returns `needsSetup:true`)
2.  Create admin -> dashboard loads
3.  Add 1 test student -> record 1 violation -> logout -> login again -> still there
4.  Delete test data after confirm.

Check logs: `pm2 logs vchecker --lines 50`, `mysql -u vche_user -p -e "SELECT count(*) FROM users; SELECT count(*) FROM students;"`

---

## Updating later

After initial setup, just push:

```bash
git pull
npm install  # if package.json changed
# drizzle schema changed? then npx drizzle-kit push --force
git add .
git commit -m "update"
git push origin main   # auto deploys
```

Manual on server (if not using GitHub):
```bash
cd /home/yourdomain.com/vchecker
git pull # if you use git, else SCP already did
npm ci
npx drizzle-kit push --force --verbose # only if schema changed
npm run build
mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/
cp .env.production .next/standalone/.env
PORT=3005 pm2 reload vchecker --update-env
pm2 save
```

Backup DB before schema changes:
```bash
mysqldump -u vche_user -p vche_db > backup_$(date +%F).sql
```

---

## Troubleshooting

| You see | Check first | Command |
|---|---|---|
| `502 Bad Gateway` | PM2 not running or port mismatch | `pm2 list`, `curl http://127.0.0.1:3005/api/health`, `ss -tlnp \| grep 3005` must show 3005 |
| `503 Service Unavailable` | vHost handler name mismatch | `cat vHost Conf` -> `extprocessor vchecker` and `handler vchecker` must be same |
| `EACCES pm2 install` | No sudo | We use `~/.npm-global` prefix - see Step 6, do not use `sudo npm install -g pm2` |
| `tar Permission denied .git` | Workflow tried to upload .git | Fixed in deploy.yml: `source: src,drizzle,...` not `.` |
| `could not read Username for https://github.com` | Private repo git fetch | Fixed: workflow now uses SCP, not `git fetch` on server. Keep `GH_TOKEN` only if you switch back to git pull |
| `AUTH_SECRET must be configured` | `.env` not copied | `cat .next/standalone/.env` must have `AUTH_SECRET`, `DATABASE_URL`, `NODE_ENV=production` |
| `Database connection failed` `{ok:false}` | DATABASE_URL wrong | `cat .env.production`, `mysql -u USER -p -h 127.0.0.1 -e "SHOW TABLES;"` |
| `404 _next/static/...` | Forgot copy | `cp -r .next/static .next/standalone/.next/` |
| `EADDRINUSE 3005` | Another app uses 3005 | Change `APP_PORT` to `3006` for second app + new extprocessor |
| `Health failed` after deploy | Build not finished | `pm2 logs vchecker --lines 100`, wait 60s, `curl -v http://127.0.0.1:3005/api/health` |

After each vHost change: `/usr/local/lsws/bin/lswsctrl reload` and `tail /usr/local/lsws/logs/error.log`.

---

## AI Help - When you are stuck

**Use this when you tried the table above for 10 minutes and still stuck.**

### What to copy

Open server SSH and run these, copy all output:

```bash
pm2 list
pm2 logs vchecker --lines 50
curl -I http://127.0.0.1:3005/api/health
curl -I https://yourdomain.com/api/health
cat /usr/local/lsws/logs/error.log | tail -50
cat .env.production | grep -v PASSWORD # hide password
cat /usr/local/lsws/conf/vhosts/yourdomain.com/vhost.conf | grep -A20 "extprocessor vchecker"
ss -tlnp | grep 3005
node -v; npm -v
```

And your vHost block (the `extprocessor vchecker { ... }` + `context / { ... }`).

### Prompt to paste to AI (ChatGPT, Muse, Gemini)

Copy-paste this prompt + your logs:

```
I am deploying Next.js 16 standalone on CyberPanel OpenLiteSpeed with PM2 on port 3005, Drizzle MySQL, no Docker.
Workflow: GitHub Actions SCP upload -> npm ci -> drizzle push --force -> npm run build -> pm2 reload vchecker -> health check http://127.0.0.1:3005/api/health.
My vHost:
[PASTE extprocessor vchecker + context / block]

Error:
[PASTE 50 lines from pm2 logs + curl health + lsws error.log]

Question: What should I check next? Give me 3 commands to run on server and how to fix vHost if handler name or port mismatched.
```

### Where to ask

*   **ChatGPT / Muse / Gemini** - paste prompt
*   **CyberPanel Forum** - include `vHost Conf` + `pm2 list`
*   **GitHub Issues** for this repo - attach `deploy.yml` run log (Actions -> failed run -> Download logs)

### Tips

*   Always hide `DATABASE_URL` password (`***`) before pasting.
*   Tell AI: `No Docker, PM2 standalone, standalone server.js, env at .next/standalone/.env`.
*   If AI suggests `docker compose`, say `CyberPanel OpenLiteSpeed proxy to PM2 only`.

---

## Appendix

**Cheat sheet:**
```bash
openssl rand -base64 48          # new AUTH_SECRET
npm ci && npx drizzle-kit push --force --verbose
npm run build && mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/ && cp .env.production .next/standalone/.env
PORT=3005 pm2 reload vchecker --update-env || PORT=3005 pm2 start .next/standalone/server.js --name vchecker
pm2 save && pm2 list && curl http://127.0.0.1:3005/api/health
/usr/local/lsws/bin/lswsctrl reload
```

**Secrets vs port:** `APP_PORT=3005` in GitHub Secrets must equal `address 127.0.0.1:3005` in vHost. Change both if you change port.

**No Docker:** This guide never uses `docker` or `docker-compose`. If some tutorial says `docker`, ignore for CyberPanel PM2 deploys.

---

*Made for Vchecker team. Last updated 2026-08-24 for PM2 deploy `d91aecf`.*
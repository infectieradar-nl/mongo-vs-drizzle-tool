# Mongo vs SQL Benchmark Tool

Benchmark the same auth + survey flow on two backends:

- MongoDB route (`/mongo`)
- Drizzle + PostgreSQL route (`/drizzle`)

## Prerequisites

- Node.js `>= 20.19.0`
- `npm`
- Reachable MongoDB and PostgreSQL instances

## Configure The Web App (Environment Variables)

```env
APP_URL=http://localhost:3000

POSTGRES_DATABASE_URL=postgres://user:password@host:5432/dbname

MONGO_URI=mongodb://user:password@host:27017
MONGO_DBNAME=your_db_name
```

### Variable reference

- `APP_URL`: Base URL used by auth and API clients (address needed to access the app from the browser)
- `POSTGRES_DATABASE_URL`: Required for Drizzle auth, Drizzle router, Drizzle migrations, and Drizzle seed/init.
- `MONGO_URI`: Required for Mongo auth, Mongo router, and Mongo seed/init.
- `MONGO_DBNAME`: Database name used for Mongo auth and benchmark collections.

Note: This app currently initializes both auth providers in shared server context, so provide all variables even if you mostly test one route.

## Install And Run Locally

```bash
npm install
npm run db:drizzle:init
npm run db:mongo:init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Before Deployment: Admin / Deployment Commands (Docker/OpenShift)

Use these runtime commands:

```bash
npm run db:mongo:init
npm run db:drizzle:init
```

What they do:

- `db:mongo:init`: Creates Mongo benchmark indexes and upserts benchmark study/surveys.
- `db:drizzle:init`: Runs Drizzle schema push, then upserts benchmark study/surveys.

### OpenShift Job command examples

Mongo:

```yaml
command: ["npm", "run", "db:mongo:init"]
```

Drizzle:

```yaml
command: ["npm", "run", "db:drizzle:init"]
```

If you need direct commands instead of npm scripts:

```yaml
command: ["node", "--import", "tsx", "lib/mongo-db/scripts/init-and-seed.ts"]
```

```yaml
command: ["sh", "-lc", "drizzle-kit push && node --import tsx lib/drizzle-db/scripts/init-and-seed.ts"]
```

## Usage

1. Open `/`.
2. Choose one route: `/mongo` or `/drizzle`.
3. Sign up on the matching page:
a. Mongo: `/mongo/signup`
b. Drizzle: `/drizzle/signup`
4. Or rog in on the matching login page:
a. Mongo: `/mongo/login`
b. Drizzle: `/drizzle/login`
5. On the selected benchmark page, use **Test Survey Flow** and click `Survey 1` or `Survey 2`.
6. Confirm submission results in the dialog (`Success`/`Error`) and elapsed time.
7. Check **Global Stats** for user and response totals.
8. Check **Recent Survey Responses** cards and click **Reload** to fetch latest participant responses.
9. Repeat the same steps on the other route to compare behavior/performance.

Note: Mongo and Drizzle auth are isolated (different cookies/stores), so sign up/login separately for each route.

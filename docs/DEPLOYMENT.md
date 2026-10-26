# Deployment

## 1. MongoDB Atlas

1. Create an **M0** (free) cluster, region **Mumbai (ap-south-1)**.
2. Database Access → add user `skillsprint-api` with a long random password, role *readWrite on any database* (or scoped to `skillsprint`).
3. Network Access → `0.0.0.0/0` for Render's free tier (no static egress IP). Paid Render plans can use static IPs; restrict to those.
4. Copy the connection string: `mongodb+srv://skillsprint-api:<password>@<cluster>.mongodb.net/skillsprint?retryWrites=true&w=majority`.

## 2. Backend on Render

**Option A — Blueprint (recommended).** Push the repo to GitHub, then in Render: *New → Blueprint →* select the repo. `render.yaml` creates the `skillsprint-api` web service (Singapore region, Node 22, `/health` check). When prompted, enter:

- `MONGODB_URI` — the Atlas string above
- `GEMINI_API_KEY` — your Google AI Studio key

`JWT_ACCESS_SECRET` is generated automatically.

**Option B — manual web service.** Root directory `backend`, build `npm ci --include=dev && npm run build && npm prune --omit=dev`, start `npm start`, health check path `/health`, and the environment variables from `backend/.env.example`.

**Seed content once** (Render → Shell, or locally against the Atlas URI):

```bash
npm run seed:prod      # on Render, after a build
# or locally:
MONGODB_URI="mongodb+srv://…" npm run seed
```

**Verify:**

```bash
curl https://<service>.onrender.com/health                 # {"status":"ok","db":"connected",…}
curl https://<service>.onrender.com/api/v1/openapi.json | head
```

Notes: Render's free tier sleeps after inactivity (first request takes ~30–60 s). Upgrade to a paid instance for production traffic.

## 3. Android app with EAS

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init                    # creates the EAS project and writes its id into app.json
```

Set the production API URL in `eas.json` (`preview` and `production` profiles → `EXPO_PUBLIC_API_URL`), then:

| Goal | Command | Output |
|---|---|---|
| Development build (emulator / your phone, with dev menu) | `npx eas-cli@latest build --profile development --platform android` | APK |
| Shareable test build | `npx eas-cli@latest build --profile preview --platform android` | APK |
| Play Store release | `npx eas-cli@latest build --profile production --platform android` | AAB |
| Submit to Play Console | `npx eas-cli@latest submit --platform android` | — |

Install an APK on a device via the QR code/link EAS prints, or `adb install app.apk`. With a development build installed, run `npx expo start --dev-client` and open the project from the app.

Local alternative (requires Android Studio + SDK): `npx expo run:android`.

## 4. GitHub & CI

```bash
git remote add origin https://github.com/<you>/skillsprint-ai.git
git push -u origin main
```

`.github/workflows/ci.yml` runs on every push/PR: backend lint, typecheck, tests (against a MongoDB 7 service container) and build; mobile lint, typecheck, Jest and an Android JS bundle export.

## Production checklist

- [ ] `NODE_ENV=production`; `EXPOSE_DEV_RESET_TOKEN` unset (the server refuses to start if it is `true` in production)
- [ ] `JWT_ACCESS_SECRET` is ≥32 random characters and differs from development
- [ ] `MONGODB_URI` points at Atlas with a dedicated, least-privilege user
- [ ] `GEMINI_API_KEY` set only in Render; `npm run test:gemini-live` passed against it; key restricted to the Generative Language API in Google Cloud
- [ ] `AI_DAILY_REQUEST_LIMIT` / `AI_PER_MINUTE_LIMIT` sized for your Gemini quota and budget; billing alerts set in Google Cloud
- [ ] `CORS_ORIGINS` lists only browser origins you serve (empty is fine for native-only)
- [ ] Content seeded (`npm run seed:prod`) and an admin account promoted
- [ ] `/health` returns 200 on Render; Render health checks and notifications enabled
- [ ] Atlas backups enabled (paid tiers) or a `mongodump` schedule in place
- [ ] Mobile `EXPO_PUBLIC_API_URL` for `preview`/`production` points at the HTTPS Render URL
- [ ] App icon, splash and `android.package` (`ai.skillsprint.app`) confirmed before the first Play Store upload
- [ ] An email provider wired into `auth.service.ts → forgotPassword` (currently codes are only returned in development)
- [ ] Privacy policy published (tutor chats stored up to 180 days, account deletion available in Settings)

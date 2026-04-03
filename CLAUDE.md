# Workout Planner — Claude Code Guide

## What this project is

A single-page React web app for tracking gym workouts. All data is stored in
the browser's `localStorage` (no backend). The app is deployed as a static
site to AWS S3 + CloudFront.

## Tech stack

| Layer | Choice |
|---|---|
| UI framework | React 19 (Vite) |
| Styling | Vanilla CSS (`src/index.css`) — dark theme, CSS custom properties |
| State | React `useState` + direct `localStorage` reads/writes |
| Tests | Vitest + Testing Library |
| Deploy | GitHub Actions → S3 sync → CloudFront invalidation |

## Project structure

```
src/
  auth.js                  — session helpers (store/get/clear Google user in localStorage)
  store.js                 — all localStorage CRUD (exercises, templates, logs); keys namespaced by userId
  index.css                — global styles and design tokens
  App.jsx                  — auth gate, sidebar navigation + page routing
  pages/
    Login.jsx              — Google Sign-In screen (shown when not authenticated)
    Exercises.jsx          — configure exercises (name, muscle group, notes)
    Templates.jsx          — save named workout templates
    WorkoutLog.jsx         — log a workout session
    Calendar.jsx           — browse past workouts by date
  components/
    Modal.jsx              — reusable modal overlay
    WorkoutBuilder.jsx     — shared component for building exercise/set lists
  test/
    setup.js               — vitest global setup (@testing-library/jest-dom)
    store.test.js          — unit tests for store CRUD operations
    WorkoutBuilder.test.jsx — component tests for WorkoutBuilder
    Exercises.test.jsx     — component tests for the Exercises page
.github/workflows/
  deploy.yml               — CI/CD: test → build → S3 sync → CF invalidation
.env.example               — documents required environment variables
```

## Data model

```js
// Exercise
{ id: uuid, name: string, muscleGroup: string, notes: string }

// Template
{ id: uuid, name: string, description: string, exerciseItems: ExerciseItem[] }

// WorkoutLog
{ id: uuid, name: string, date: 'YYYY-MM-DD', notes: string, exerciseItems: ExerciseItem[] }

// ExerciseItem (used inside templates and logs)
{ exerciseId: uuid, sets: [{ reps: string, weight: string }] }
```

## Common commands

```bash
npm run dev        # start dev server (http://localhost:5173)
npm test           # run tests once
npm run test:watch # run tests in watch mode
npm run build      # production build → dist/
npm run preview    # preview the production build locally
```

## AWS deployment setup

The app is deployed via the GitHub Actions workflow in
`.github/workflows/deploy.yml`. You must set the following secrets in your
GitHub repository settings:

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | Region where your S3 bucket lives (e.g. `us-east-1`) |
| `S3_BUCKET` | Name of the S3 bucket (e.g. `my-workout-planner-app`) |
| `CLOUDFRONT_DISTRIBUTION_ID` | Your CloudFront distribution ID |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID (see below) |

### Minimal IAM policy for the deploy user

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::YOUR_BUCKET",
        "arn:aws:s3:::YOUR_BUCKET/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DIST_ID"
    }
  ]
}
```

### CloudFront / S3 configuration notes

- The S3 bucket should **not** have static website hosting enabled. Instead,
  use CloudFront with an Origin Access Control (OAC) policy so the bucket
  remains private.
- Set the CloudFront default root object to `index.html`.
- Add a custom error response: HTTP 403/404 → `index.html` (200) so that
  client-side navigation works after a hard refresh (React SPA).

## Google OAuth setup

Authentication uses [Google Identity Services](https://developers.google.com/identity/gsi/web)
(GIS) — a frontend-only OAuth flow, no backend required.

### Steps

1. Go to [Google Cloud Console](https://console.cloud.google.com/) →
   **APIs & Services → Credentials → Create credentials → OAuth 2.0 Client ID**.
2. Application type: **Web application**.
3. Add **Authorized JavaScript origins**:
   - `http://localhost:5173` (local dev)
   - `https://your-cloudfront-domain.cloudfront.net` (production)
4. Copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`).
5. For local dev: copy `.env.example` to `.env` and paste the client ID there.
6. For production: add it as a GitHub Actions secret named `VITE_GOOGLE_CLIENT_ID`.

### How it works

- The GIS script is loaded in `index.html` with `async` (no defer).
- `Login.jsx` polls for `window.google.accounts.id` then calls `renderButton()`.
- On successful sign-in, Google returns a JWT credential. `parseJwt()` in
  `auth.js` decodes the payload to extract `sub`, `name`, `email`, and
  `picture`. The `sub` field is Google's stable, unique user identifier.
- The user profile is stored in `localStorage` under `wp_auth` so the session
  persists across page refreshes.
- All workout data keys in `store.js` are suffixed with `_<sub>`, so multiple
  Google accounts on the same device have completely isolated data.
- Sign-out clears `wp_auth` and calls `google.accounts.id.disableAutoSelect()`
  to prevent the One Tap prompt from re-appearing immediately.

## Development guidelines

- All persistent state lives in `src/store.js`. Keep it pure functions that
  accept `userId` as first parameter and read/write `localStorage`. No global
  state library needed.
- The `WorkoutBuilder` component is shared between Templates and WorkoutLog.
  Keep it presentation-only — callers own the state and pass `onChange`.
- Avoid adding a backend. The localStorage approach is intentional and
  sufficient for a personal workout tracker.
- New pages: add an entry to the `PAGES` array in `App.jsx` and render the
  component in the page switcher block.

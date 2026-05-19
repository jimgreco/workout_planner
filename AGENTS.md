# Workout Planner — Codex Guide

## What this project is

A single-page React web app for tracking gym workouts. Data is stored in AWS
DynamoDB and served via a serverless API, enabling cross-device sync. The app
is deployed as a static site (S3 + CloudFront) with a SAM-managed backend
(API Gateway + Lambda + DynamoDB).

## Tech stack

| Layer | Choice |
|---|---|
| UI framework | React 19 (Vite) |
| Styling | Vanilla CSS (`src/index.css`) — dark theme, CSS custom properties |
| State | React `useState` + in-memory cache in `src/api.js` |
| Auth | Google Identity Services (GIS) — frontend OAuth, ID token verified in Lambda |
| API | AWS API Gateway HTTP API (v2) |
| Compute | AWS Lambda (Node.js 22, ESM) |
| Database | AWS DynamoDB (single-table, on-demand billing) |
| IaC | AWS SAM (`backend/template.yaml`) |
| Tests | Vitest + Testing Library |
| Deploy | GitHub Actions → SAM deploy → Vite build → S3 sync → CF invalidation |

## Architecture

```
Browser  →  CloudFront  →  S3 (React SPA)
               ↓
         API Gateway HTTP API
               ↓
            Lambda  →  DynamoDB
```

Authentication flow:
1. User signs in with Google (GIS library)
2. Google returns a signed ID token (JWT, expires in 1h)
3. Token is stored in localStorage with its expiry
4. Every API request sends `Authorization: Bearer <token>`
5. Lambda verifies the token via `google-auth-library` and extracts `sub`
6. DynamoDB data is keyed by `USER#<sub>`

## Project structure

```
backend/
  template.yaml            — SAM template: DynamoDB table, HTTP API, Lambda
  src/
    handler.mjs            — Lambda handler (routes by path+method)
  package.json             — google-auth-library + @aws-sdk deps
src/
  api.js                   — async API client with in-memory cache; replaces localStorage store
  auth.js                  — Google credential + user profile storage in localStorage
  index.css                — global styles and design tokens
  App.jsx                  — auth gate, data loading, sidebar navigation + page routing
  pages/
    Login.jsx              — Google Sign-In screen
    Exercises.jsx          — configure exercises (name, muscle group, notes)
    Templates.jsx          — save named workout templates
    WorkoutLog.jsx         — log a workout session
    Calendar.jsx           — browse past workouts by date
  components/
    Modal.jsx              — reusable modal overlay
    WorkoutBuilder.jsx     — shared component for building exercise/set lists
  test/
    setup.js               — vitest global setup
    api.test.js            — unit tests for api.js (mocks fetch)
    WorkoutBuilder.test.jsx — component tests for WorkoutBuilder
    Exercises.test.jsx     — component tests for Exercises page
.github/workflows/
  deploy.yml               — CI/CD: test → SAM deploy → Vite build → S3 → CF
.env.example               — required environment variables
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

DynamoDB key schema (single table):
```
PK  =  USER#<googleSub>
SK  =  EXERCISE#<id>  |  TEMPLATE#<id>  |  LOG#<id>
```

## Common commands

```bash
npm run dev        # start dev server (http://localhost:5173)
npm test           # run tests once
npm run test:watch # run tests in watch mode
npm run build      # production build → dist/
npm run preview    # preview the production build locally

# Backend (from repo root)
cd backend && npm install
sam build --template backend/template.yaml
sam local start-api --template backend/template.yaml   # local API dev
```

## AWS deployment setup

The GitHub Actions workflow (`.github/workflows/deploy.yml`) runs three jobs:
`test → deploy-backend → deploy-frontend`. The API URL is captured from the
SAM stack output and injected into the Vite build automatically.

Set these secrets in your GitHub repository settings:

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | e.g. `us-east-1` |
| `S3_BUCKET` | Frontend assets bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |

### IAM policy for the deploy user

The deploy user needs the S3/CloudFront permissions from before **plus** the
following for SAM:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject", "s3:CreateBucket"],
      "Resource": ["arn:aws:s3:::*"]
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DIST_ID"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudformation:*"],
      "Resource": "arn:aws:cloudformation:*:*:stack/workout-planner-backend/*"
    },
    {
      "Effect": "Allow",
      "Action": ["lambda:*"],
      "Resource": "arn:aws:lambda:*:*:function:workout-planner-*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:CreateTable", "dynamodb:DescribeTable", "dynamodb:DeleteTable", "dynamodb:UpdateTable"],
      "Resource": "arn:aws:dynamodb:*:*:table/workout-planner-*"
    },
    {
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:AttachRolePolicy", "iam:DeleteRole", "iam:DetachRolePolicy",
                 "iam:GetRole", "iam:PassRole", "iam:PutRolePolicy", "iam:DeleteRolePolicy"],
      "Resource": "arn:aws:iam::*:role/workout-planner-*"
    },
    {
      "Effect": "Allow",
      "Action": ["apigateway:*"],
      "Resource": "*"
    }
  ]
}
```

### CloudFront / S3 configuration notes

- The S3 bucket should **not** have static website hosting enabled. Use an
  Origin Access Control (OAC) policy so the bucket remains private.
- Set the CloudFront default root object to `index.html`.
- Add a custom error response: HTTP 403/404 → `index.html` (200) for SPA routing.

## Google OAuth setup

1. [Google Cloud Console](https://console.cloud.google.com/) →
   **APIs & Services → Credentials → Create OAuth 2.0 Client ID → Web application**
2. Add **Authorized JavaScript origins**: `http://localhost:5173` + your CloudFront URL
3. Copy the Client ID, set it as `VITE_GOOGLE_CLIENT_ID`
4. For local dev: `cp .env.example .env` and fill in both variables

### How auth works

- `Login.jsx` renders the GIS button; on sign-in Google returns a JWT credential
- The raw JWT is stored in `localStorage` (with expiry) via `auth.js`
- `api.js` reads the credential before every request; if it's missing or within
  5 minutes of expiry, a `wp:auth-error` event is fired → `App.jsx` signs the user out
- The Lambda verifies the token on every request using `google-auth-library`

## Development guidelines

- All API calls go through `src/api.js`. Keep it as the single source of truth
  for data. The in-memory cache is populated once on login via `initData()`.
- The `WorkoutBuilder` component is shared between Templates and WorkoutLog.
  Keep it presentation-only — callers own the state and pass `onChange`.
- New pages: add an entry to the `PAGES` array in `App.jsx` and render the
  component in the page switcher block.
- Backend changes: edit `backend/src/handler.mjs` and `backend/template.yaml`.
  Test locally with `sam local start-api`.

# Workout Planner — Gemini Guide

Use `AGENTS.md` as the current source of truth for architecture, commands,
auth, and deployment. The active production path is EC2 + Docker Compose.

## Current Production Shape

- Frontend: React/Vite static build served by Nginx in Docker.
- API: Node 22 backend container running `backend/local-server.mjs`.
- Data: DynamoDB table keyed by `USER#<providerSub>`.
- Deploy: GitHub Actions verifies, rsyncs to EC2, rebuilds Docker Compose, and
  smoke-tests `https://workout-planner.jim-greco.com/api/healthz`.

## Auth

Google and Apple ID tokens are exchanged once at `/auth/google` or
`/auth/apple`. The API returns a signed app session token used for normal data
requests.

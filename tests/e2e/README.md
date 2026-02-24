# E2E Smoke Tests

This directory hosts lightweight end-to-end smoke coverage for critical routes.

## Current scope

- Home route responds: `/`
- Login route responds: `/auth/login`
- Protected dashboard route responds or redirects: `/dashboard/user`

## Run locally

1. Start the app in another terminal:
   - `npm run dev`
2. Run smoke tests:
   - `npm run test:e2e:smoke`

## Custom base URL

- Default: `http://localhost:3000`
- Override:
  - PowerShell: `$env:E2E_BASE_URL='http://localhost:3001'; npm run test:e2e:smoke`

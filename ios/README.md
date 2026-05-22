# Forge iPhone App

Native SwiftUI iPhone client for the Forge Workout Planner API. It mirrors the
web app's workout logging, exercise library, workout templates, and history.

## Setup

1. Install Xcode 26 or newer.
2. Generate the project:

   ```bash
   cd ios
   xcodegen generate
   ```

3. Open `ios/WorkoutPlanner.xcodeproj`.
4. In `ios/project.yml`, set:
   - `API_BASE_URL` to the deployed API base URL, usually `https://workout-planner.jim-greco.com/api`
   - `GOOGLE_IOS_CLIENT_ID` to the iOS OAuth client ID
   - `CFBundleURLSchemes` to the reversed iOS client ID
5. Enable **Sign in with Apple** for `com.workoutplanner.ios` in the Apple Developer portal.
6. Regenerate the project after editing `project.yml`.

## Auth Contract

The app exchanges Google or Apple identity tokens for a backend app session:

- `POST /auth/google` with `{ credential }`
- `POST /auth/apple` with `{ identityToken, profile }`

The returned app session token is stored in Keychain and used for normal
`Authorization: Bearer <token>` data requests. Production backend configuration
must include the iOS OAuth client ID in `GOOGLE_CLIENT_IDS` and
`com.workoutplanner.ios` in `APPLE_CLIENT_IDS`.

Apple only returns the email/full-name fields the first time a user authorizes
the app, and the user may choose a private relay address. To keep Google and
Apple sign-ins pointed at the same Forge data, sign in with Google and use
Account → Link Apple ID. That links Apple's stable user id to the current
backend account even if Apple does not return an email on later sign-ins.

# Forge iPhone App

Native SwiftUI iPhone client for the Workout Planner API. It mirrors the mobile web app's pages and data model:

- Workout logging with planning, active, finish, discard, and edit flows
- Exercise library with search, CRUD, and personal bests
- Workout templates with defaults, view/start/edit/delete
- History list and calendar views
- Sign in with Apple and Google Sign-In with the same `Authorization: Bearer <id-token>` API contract

## Setup

1. Install Xcode 26 or newer.
2. Generate the project:

   ```bash
   cd ios
   xcodegen generate
   ```

3. Open `ios/WorkoutPlanner.xcodeproj`.
4. In `ios/project.yml`, replace:
   - `API_BASE_URL` with the deployed API Gateway base URL
   - `GOOGLE_IOS_CLIENT_ID` with the iOS OAuth client ID
   - `CFBundleURLSchemes` with the reversed iOS client ID
5. In the Apple Developer portal, enable **Sign in with Apple** for the app's bundle ID.
6. Regenerate the project after editing `project.yml`.

The backend accepts the existing web Google client ID plus optional extra IDs through the `GoogleClientIds` SAM parameter. Pass the iOS OAuth client ID there so native Google tokens verify successfully.

For Apple, pass the app bundle ID, currently `com.workoutplanner.ios`, through the `AppleClientIds` SAM parameter so native Apple identity tokens verify successfully.

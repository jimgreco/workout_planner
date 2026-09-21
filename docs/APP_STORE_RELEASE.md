# App Store release preparation

App: Rep, Mix, Burn (`6770769722`), bundle `com.workoutplanner.ios`.
SpringBoard display name: Rep Mix Burn.

## Listing

- Version: 1.1; free; manual release after approval.
- Category: Health & Fitness.
- Subtitle: Workout planner & strength log.
- Age rating: 9+, including health or wellness topics; no social content,
  messaging, unrestricted browsing, advertising, gambling, or mature content.
- Marketing: https://repmixburn.com
- Support: https://repmixburn.com/support.html
- Privacy: https://repmixburn.com/privacy.html

The English description and keywords are saved in App Store Connect.

## Privacy evidence

The app stores account name, email, provider identifier, exercise and workout
records, routines, programs, gym/equipment lists, notes, settings, and feedback.
Feedback includes a build label; service diagnostics support troubleshooting.
These are linked to the account and used for app functionality, without tracking.

The installed Google Sign-In SDK's bundled privacy manifest additionally declares
phone number and coarse location for app functionality; device ID and other usage
data for analytics; and user ID and other data for functionality and analytics.
The App Store label must include SDK declarations as well as first-party storage.
No tracking is declared by that SDK. Re-audit this when changing sign-in SDKs.

`ios/WorkoutPlanner/PrivacyInfo.xcprivacy` records the app's first-party collection
and the UserDefaults required-reason API declaration (`CA92.1`). Dependencies
supply their own bundled manifests.

## Remaining release gates

- Add public support email and Apple's private review contact details.
- Capture and inspect actual iPhone and iPad screenshots, with synthetic demo
  data. Upload the required display sizes shown by App Store Connect.
- Supply working reviewer access. Production supports Apple and Google sign-in;
  local demo mode is Debug-only and is not reviewer access in the release binary.
  Do not enable backend development authentication in production.
- Verify sign-in, logging a workout, export, feedback, and account deletion with
  a disposable test account on a physical device.
- Select the final processed build containing the space-separated SpringBoard
  name and privacy manifest; verify encryption/compliance answers.
- Complete distribution availability and content declarations; resolve any
  remaining App Store Connect validation messages before submission.
- Follow `OPERATIONS.md` for exact-SHA deployment and TestFlight evidence.

Do not equate an upload, simulator build, or saved listing with App Review approval
or physical-device acceptance.

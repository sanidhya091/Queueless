# QueueLess

QueueLess is an Expo SDK 57 React Native app for viewing and reporting queues at public offices in Jabalpur. The Android project is checked in for local development builds and uses Expo's native modules plus MapLibre.

## Requirements

- Node.js 22.13.x or newer (the repository pins 22.13.0 in `.nvmrc`).
- npm (the repository uses `package-lock.json`).
- For Android development builds: Android Studio/SDK, an Android emulator or USB-connected device, and a Java/Gradle environment supported by the generated Android project.
- A Supabase project containing the app's expected `places` and `queue_reports` data.

Expo SDK 57 requires Node.js 22.13.x or newer. Use the repository pin with a version manager such as `nvm use`.

## Setup

```bash
nvm install
nvm use
npm ci
cp .env.example .env
```

Edit `.env` and replace the two placeholder values with the Supabase project URL and publishable key. These are public Expo runtime variables, but do not commit `.env` or put service-role keys in it. `.env` is ignored by Git.

## Run the app

Start the Metro development server:

```bash
npm start
```

Then use the Expo CLI prompts to open an available target. Web is available with:

```bash
npm run web
```

The MapLibre native module is not available in standard Expo Go. Use the Android development-build flow below for the full native app.

## Checks

Run the focused regression tests, lint, and TypeScript check:

```bash
npm test
npm run lint
npm run typecheck
```

`npm test` runs `screens/HomeScreen.navigation.test.cjs`, which uses Node's built-in test runner and checks that selecting each kind of office preserves the selected place ID during navigation.

## Android development build

The checked-in `android/` project is the local native project. Install dependencies and ensure an emulator or device is available, then run:

```bash
npm ci
npm run android
```

This invokes `expo run:android`, which builds and installs the debug development build. If the native project has been regenerated or the installed SDK changes, use Expo's supported prebuild workflow rather than hand-editing generated native files:

```bash
npx expo prebuild --clean
npm run android
```

Do not run `prebuild --clean` if you need to preserve uncommitted native changes. Android release signing is not configured for distribution; the checked-in debug keystore is for local development only.

## Environment and secrets

Required variable names are documented in `.env.example`. Never copy `.env` values into source, documentation, logs, or issue reports. Supabase publishable keys are intended for client use, but database access must still be protected by Supabase Row Level Security policies.

## Docker

There is intentionally no Dockerfile. Docker can provide a reproducible Node/Metro environment, but it cannot by itself provide the Android SDK, emulator/device, native graphics stack, or a useful mobile runtime. A Dockerfile claiming to build and run this Expo Android app would either be incomplete or require a large, machine-dependent Android toolchain setup. The reproducible local path is the pinned Node runtime, `npm ci`, and the checked-in Gradle/Android project; use a CI or EAS Android build environment for cloud builds.

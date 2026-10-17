FROM node:22.13.0-bookworm-slim

WORKDIR /app

# Install exactly the dependency tree recorded in the lockfile.
COPY package.json package-lock.json ./
RUN npm ci

# Copy only files needed by the Expo lint/typecheck configuration and tests.
# Secrets, native projects, and generated/build output are intentionally omitted.
COPY App.tsx index.ts app.json eslint.config.js tsconfig.json ./
COPY lib ./lib
COPY screens ./screens
COPY assets ./assets

# Run every repository check in order and stop at the first failure. This image
# verifies the project; it does not contain an Android SDK or emulator.
CMD ["sh", "-c", "set -eu; npm test && npm run lint && npm run typecheck"]

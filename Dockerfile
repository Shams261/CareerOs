# Silsila production image (ADR-013).
#
# A multi-stage build: each FROM starts a new stage, and only the last one ("runtime") becomes
# the image that runs. Earlier stages exist to build things; their files are copied forward
# with COPY --from, so compilers, dev dependencies and the source tree stay out of the final image.
#
# Build:  docker build -t silsila .
# Run:    docker run --rm -p 3000:3000 --env-file .env.docker silsila
# Heroku builds this same file through heroku.yml, so production runs exactly what was tested.

# ---------------------------------------------------------------------------------------------
# Stage "base": the Node.js version and the pinned pnpm every later stage shares.
# bookworm-slim is Debian without extras. Prisma 7 with the pg driver adapter needs no query
# engine at runtime, but the CLI's migration engine and outbound TLS need OpenSSL and CA roots.
# ---------------------------------------------------------------------------------------------
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# The Prisma CLI's migration engine links against OpenSSL, and outbound TLS (Google, push
# services, a managed database) needs the CA bundle; the slim image ships neither.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Same version as "packageManager" in package.json. A moving pnpm would make builds drift.
RUN npm install --global pnpm@11.19.0
WORKDIR /app

# ---------------------------------------------------------------------------------------------
# Stage "deps": install every dependency (including dev) from the lockfile.
# Only the manifest files are copied first so Docker can reuse this layer from cache whenever the
# lockfile is unchanged, even if application source changed.
# ---------------------------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------------------------
# Stage "build": compile the application. `pnpm build` runs `prisma generate` and
# `next build --webpack`; neither needs a database or any secret.
# ---------------------------------------------------------------------------------------------
FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The webpack cache under .next/cache only speeds up the next build; it must not ship.
RUN pnpm build && rm -rf .next/cache

# ---------------------------------------------------------------------------------------------
# Stage "runtime": what actually runs. Production dependencies only (the Prisma CLI and tsx are
# runtime dependencies so `pnpm db:deploy` and `pnpm timestamps:audit` work from this image),
# plus the built output and the files Next.js and Prisma read at start-up.
# ---------------------------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# --prod skips devDependencies; the store is removed afterwards because node_modules already
# holds hard links to every file it needs and the store would otherwise double the layer.
RUN pnpm install --frozen-lockfile --prod && pnpm store prune && rm -rf /pnpm/store /root/.cache
# next.config.ts imports src/server/security.ts and prisma.config.ts imports src/lib/database.ts,
# so the source tree stays; scripts/ carries the operations tooling. Files are owned by the
# unprivileged "node" user that the image ships with.
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src ./src
COPY --chown=node:node next.config.ts prisma.config.ts tsconfig.json ./
# Regenerate the Prisma client for the production node_modules (pure TypeScript output, fast).
RUN pnpm db:generate && chown -R node:node /app/src/generated
USER node
# Heroku sets PORT; `next start` reads it and binds 0.0.0.0. 3000 is the default elsewhere.
EXPOSE 3000
CMD ["pnpm", "start"]

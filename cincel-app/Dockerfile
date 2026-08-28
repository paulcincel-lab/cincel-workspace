FROM node:23-alpine AS build
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies only when needed
COPY package.json package-lock.json ./
RUN npm ci

# Copy all other project files to working directory
COPY . .

# The app talks to Supabase directly from the browser via NEXT_PUBLIC_*
# variables. Next.js inlines every process.env.NEXT_PUBLIC_* reference into
# the compiled bundle at build time, so these must be supplied as build
# args, not runtime env vars -- a `docker run -e` value set afterwards would
# have no effect. Left unset, NEXT_PUBLIC_CINCEL_DATA_SOURCE defaults to
# "localstorage" and the app runs against its built-in mock data instead of
# Supabase (see lib/supabase/data-source.ts).
ARG NEXT_PUBLIC_CINCEL_DATA_SOURCE=localstorage
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_CINCEL_DATA_SOURCE=$NEXT_PUBLIC_CINCEL_DATA_SOURCE \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN npm run build

FROM node:23-alpine
RUN apk update && apk upgrade && apk add dumb-init && adduser -D nextuser

# set work dir as app
WORKDIR /app
COPY --from=build --chown=nextuser:nextuser /app/public ./public
COPY --from=build --chown=nextuser:nextuser /app/.next/standalone ./
COPY --from=build --chown=nextuser:nextuser /app/.next/static ./.next/static

# set non root user
USER nextuser
# expose 3000 on container
EXPOSE 3000

# set app host, port and node env
# Next.js standalone server.js binds to HOSTNAME (not HOST); without this it
# inherits the container id as the hostname and fails with EAI_AGAIN.
ENV HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=3000 NODE_ENV=production
# start the app with dumb-init to spawn the Node.js runtime process
# with signal support
CMD ["dumb-init", "node", "server.js"]

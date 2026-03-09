# syntax=docker/dockerfile:1

# Build Stage

#FROM node:25-alpine AS builder
# FROM alpine:3.20 AS builder
FROM alpine:3.23 AS builder

WORKDIR /app

# Install Node.js and npm
# Keep image small: no cache, upgrade in one layer
RUN apk update --no-cache && \
    apk upgrade --no-cache && \
    apk add --no-cache nodejs npm busybox zlib libpng  

COPY package*.json ./

# Install ALL dependencies (dev + prod) with BuildKit cache
RUN --mount=type=cache,target=/root/.npm npm ci

# Copy source + special files
COPY . .
COPY README.md public/

# Build (assumes your build outputs to dist/)
RUN npm run build

    

# ───────────────────────────────────────────────
# Final minimal production image
# ───────────────────────────────────────────────
FROM alpine:3.23

WORKDIR /app

# Install Node.js, npm, and tini; create non-root user
RUN apk update --no-cache && \
    apk upgrade --no-cache && \
    apk add --no-cache nodejs npm tini busybox zlib libpng  && \
    addgroup -g 1001 nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Install prod deps, then clean up
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund && \
    gzip /usr/bin/node && \
    chown -R nodejs:nodejs /usr/bin && \
    chmod -R 755 /usr/bin && \
    find /app/node_modules \( \
      -name "*.md" -o \
      -name "LICENSE" -o \
      -name ".github" \
    \) -prune -exec rm -rf {} + && \
    rm -rf /tmp/node-compile-cache /var/cache/apk/* /var/log/* /opt/yarn*

# Copy only production artifacts
COPY --from=builder --chown=nodejs:nodejs /app/dist       ./dist
COPY --from=builder --chown=nodejs:nodejs /app/public     ./public
COPY --from=builder --chown=nodejs:nodejs /app/README.md  ./

# Copy the entrypoint script
COPY --chown=nodejs:nodejs entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Security: drop to non-root for runtime
USER nodejs

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
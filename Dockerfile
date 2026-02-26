FROM node:25-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Copy source + special files
COPY . .
COPY README.md public/

# Build (assumes your build outputs to dist/)
RUN npm run build

# Optional: prune dev dependencies already here (can help if you have huge dev-only artifacts)
RUN npm prune --omit=dev

# ───────────────────────────────────────────────
# Final minimal production image
# ───────────────────────────────────────────────
FROM node:25-alpine

# Add a non-root user early (security best practice)
RUN addgroup -g 1001 nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# tini is still recommended in 2026 (handles signals / zombie reaping)
RUN apk add --no-cache tini

# Fix ownership before switching to non-root user
RUN chown -R nodejs:nodejs /app

# Copy only production artifacts
COPY --from=builder --chown=nodejs:nodejs /app/dist       ./dist
COPY --from=builder --chown=nodejs:nodejs /app/public     ./public
COPY --from=builder --chown=nodejs:nodejs /app/README.md  ./
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

# Install **only** production dependencies as non-root
USER nodejs
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

# Security / reproducibility flags
ENV NODE_ENV=production
ENV PORT=3000

# No need to EXPOSE in most orchestrators (k8s, compose, etc.), but still fine to keep
EXPOSE 3000

# Use tini + non-root user
ENTRYPOINT ["/sbin/tini", "--", "su-exec", "nodejs"]
CMD ["node", "dist/server/index.js"]
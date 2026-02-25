FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
COPY README.md public/
RUN npm run build

# ───────────────────────────────────────────────
# Final image
# ───────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache tini

COPY --from=builder /app/dist       ./dist
COPY --from=builder /app/public     ./public
COPY --from=builder /app/README.md  ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/index.js"]

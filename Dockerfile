# Multi-stage production Dockerfile for ProcureAI
FROM node:24-slim AS builder

WORKDIR /app

# Copy root and client dependency specifications
COPY package*.json ./
COPY client/package*.json ./client/

# Install dependencies for both server and client
RUN npm install && npm --prefix client install

# Copy application source code
COPY . .

# Build client production bundle
RUN npm --prefix client run build

# Production runtime stage
FROM node:24-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy root package and node_modules
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/shared ./shared

# Create mount directory for persistent disk / SQLite DB
RUN mkdir -p /var/data && chown -R node:node /app /var/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]

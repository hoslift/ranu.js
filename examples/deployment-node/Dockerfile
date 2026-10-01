# 1. Base stage
FROM node:22-alpine AS base
WORKDIR /app
RUN npm install -g pnpm

# 2. Dependencies stage
FROM base AS dependencies
COPY package.json ./
RUN pnpm install --prod

# 3. Builder stage
FROM base AS builder
COPY package.json tsconfig.json ranu.config.ts ./
COPY app ./app
RUN pnpm install && pnpm build

# 4. Runner stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/.ranu/build ./.ranu/build
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["npm", "start"]

# Stage 1: Install dependencies
FROM node:20-alpine AS deps
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: Build the Next.js app
FROM node:20-alpine AS builder
ENV NODE_ENV=production

# Accept build arguments
ARG NEXT_PUBLIC_PROJECT_ID
ARG NEXT_PUBLIC_ADDRESS
ARG NEXT_PUBLIC_KYC_PAYMENT_ADDRESS
ARG NEXT_PUBLIC_ENABLE_TESTNETS

# Set environment variables for build time
ENV NEXT_PUBLIC_PROJECT_ID=${NEXT_PUBLIC_PROJECT_ID}
ENV NEXT_PUBLIC_ADDRESS=${NEXT_PUBLIC_ADDRESS}
ENV NEXT_PUBLIC_KYC_PAYMENT_ADDRESS=${NEXT_PUBLIC_KYC_PAYMENT_ADDRESS}
ENV NEXT_PUBLIC_ENABLE_TESTNETS=${NEXT_PUBLIC_ENABLE_TESTNETS}

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate
RUN npm run build

# Stage 3: Prepare the production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts

# Copy the built application and necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./

EXPOSE 3000

# Start the Next.js app
CMD ["npm", "run", "start"]

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
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS
ARG NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS_2
ARG NEXT_PUBLIC_APP_TITLE
ARG NEXT_PUBLIC_APP_DESCRIPTION
ARG NEXT_PUBLIC_TOKEN_SYMBOL
ARG NEXT_PUBLIC_TOKEN_DECIMALS


# Set environment variables for build time
ENV NEXT_PUBLIC_RPC_URL=${NEXT_PUBLIC_RPC_URL}
ENV NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS=${NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS}
ENV NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS_2=${NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS_2}
ENV NEXT_PUBLIC_APP_TITLE=${NEXT_PUBLIC_APP_TITLE}
ENV NEXT_PUBLIC_APP_DESCRIPTION=${NEXT_PUBLIC_APP_DESCRIPTION}
ENV NEXT_PUBLIC_TOKEN_SYMBOL=${NEXT_PUBLIC_TOKEN_SYMBOL}
ENV NEXT_PUBLIC_TOKEN_DECIMALS=${NEXT_PUBLIC_TOKEN_DECIMALS}

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
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

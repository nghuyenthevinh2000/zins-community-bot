FROM oven/bun:latest

WORKDIR /app

# Install dependencies first
COPY package.json ./
# If bun.lockb isn't created yet, handle it gracefully
COPY bun.lockb* ./
RUN bun install

# Generate Prisma Client
COPY prisma ./prisma
RUN bunx prisma generate

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Start the application
CMD ["bun", "run", "start"]

FROM oven/bun:latest

WORKDIR /app

# Install curl and common dependencies for OpenCode CLI
RUN apt-get update && apt-get install -y curl sqlite3 ca-certificates && rm -rf /var/lib/apt/lists/*

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:${PATH}"

# Pre-create OpenCode logs directory and verify installation
RUN mkdir -p /root/.local/share/opencode/log && \
    opencode --version && \
    opencode migrate

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

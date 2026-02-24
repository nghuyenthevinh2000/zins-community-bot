FROM oven/bun:latest

WORKDIR /app

# Set timezone to GMT+7 (Asia/Ho_Chi_Minh)
ENV TZ=Asia/Ho_Chi_Minh
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install curl and common dependencies for OpenCode CLI
RUN apt-get update && apt-get install -y curl sqlite3 ca-certificates tzdata && rm -rf /var/lib/apt/lists/*

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

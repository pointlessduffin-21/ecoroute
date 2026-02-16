FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Start the server
CMD ["bun", "run", "src/index.ts"]

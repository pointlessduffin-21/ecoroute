FROM oven/bun:1-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --production

# Copy source
COPY . .


# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose port
EXPOSE 3000

# Entrypoint handles db:push, seed, then starts the server
CMD ["./entrypoint.sh"]

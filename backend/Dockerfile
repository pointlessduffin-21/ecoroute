FROM node:22-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Install tsx and drizzle-kit for TypeScript execution + DB management
RUN npm install tsx drizzle-kit

# Copy source
COPY . .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose port
EXPOSE 3000

# Entrypoint handles db:push, seed, then starts the server
CMD ["./entrypoint.sh"]

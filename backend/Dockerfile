FROM node:22-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Install tsx for TypeScript execution (production dep for running .ts)
RUN npm install tsx

# Copy source
COPY . .

# Expose port
EXPOSE 3000

# Start the server via Node.js + tsx
CMD ["node", "--import", "tsx/esm", "src/index.ts"]

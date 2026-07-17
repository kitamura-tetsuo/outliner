# Use an official Node.js runtime as a parent image
FROM node:22-slim

# Build context is the repository ROOT (see .github/workflows/build-server.yml and
# docker-compose.yml). The server compiles the framework-neutral schema from
# ../shared into its own build, so the shared sources must sit next to the server.
WORKDIR /usr/src/app

# Framework-neutral schema shared with the client, compiled into the server build.
COPY shared/ ./shared/

# Install server dependencies (use npm ci for clean reproducible builds)
COPY server/package*.json ./server/
RUN cd server && npm ci

# Copy the rest of the server's code and build the TypeScript
# (emits dist/server/src and dist/shared/src)
COPY server/ ./server/
RUN cd server && npm run build

# Make port 1234 available to the world outside this container
EXPOSE 1234

# Define environment variables
ENV NODE_ENV=production

# Run the app when the container launches. The working directory stays at the app
# root so cwd-relative data paths (see docker-compose volume) are preserved.
CMD ["node", "server/dist/server/src/log-service.js"]

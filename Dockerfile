# syntax=docker/dockerfile:1

ARG NODE_VERSION=22.21.1

# Build the React client with its devDependencies (Vite lives here).
FROM node:${NODE_VERSION}-slim AS client-build
WORKDIR /app

COPY client/package.json client/package-lock.json ./client/
RUN npm ci --prefix client --include=dev

COPY client ./client
RUN npm --prefix client run build


# Small production image: only the Express server dependencies and built client.
FROM node:${NODE_VERSION}-slim AS runtime
LABEL fly_launch_runtime="Node.js"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev && \
    npm cache clean --force && \
    mkdir -p /data && \
    chown node:node /data

COPY server ./server
COPY --from=client-build /app/client/dist ./client/dist

USER node
EXPOSE 3000
CMD ["npm", "start"]

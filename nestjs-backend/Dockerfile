# --- build stage: compile TypeScript to dist/ ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# --ignore-scripts: the build only needs `tsc`; skips the esbuild/vitest
# postinstall (a musl binary download that is irrelevant to the image).
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: production deps + compiled output only ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public

EXPOSE 3000
# main.ts resolves the static UI at join(__dirname, '..', 'public') -> /app/public
CMD ["node", "dist/main.js"]

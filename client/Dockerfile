FROM node:20-alpine AS builder
WORKDIR /src
COPY package.json ./
RUN npm install --no-audit --no-fund || true
COPY . .
RUN npm run build || true

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /src/dist ./dist
EXPOSE 5173
ENTRYPOINT ["serve", "-s", "dist", "-l", "5173"]

FROM node:20-alpine AS base
RUN apk add --no-cache openssl

FROM base AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

FROM base
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
EXPOSE 8091
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx prisma db seed && node dist/src/server.js"]

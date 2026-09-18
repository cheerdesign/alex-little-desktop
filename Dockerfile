FROM node:24-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY public ./public
COPY worker ./worker
COPY drizzle ./drizzle
COPY railway ./railway

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]

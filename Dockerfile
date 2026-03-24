FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data
ENV PORT=80
EXPOSE 80
CMD ["node", "server.js"]

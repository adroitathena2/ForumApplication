FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=42370
EXPOSE 42370
CMD ["node", "app.js"]

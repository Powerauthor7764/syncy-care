FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]

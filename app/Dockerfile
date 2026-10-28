FROM node:20-alpine

# ISO/IEC 27001:2022 A.8.8 - Upgrade OS packages to eliminate known vulnerabilities (Trivy Gate)
RUN apk update && apk upgrade --no-cache

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# Create non-root directory permissions for uploads/fallback storage
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app

USER node

EXPOSE 3000

CMD ["npm", "start"]

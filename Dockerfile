FROM node:20-alpine

WORKDIR /app

RUN apk update
RUN apk upgrade

COPY . /app

RUN npm ci

CMD ["npm", "start"]
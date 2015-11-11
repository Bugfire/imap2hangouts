FROM node:0.12.7

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json hangups.patch /usr/src/app/
RUN npm install
RUN patch -p0 < hangups.patch

COPY imap2hangouts.js run.sh /usr/src/app/

VOLUME ["/data"]

CMD [ "./run.sh" ]

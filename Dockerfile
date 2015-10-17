FROM node:0.12.7

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install

COPY iconv-lite_to_jconv.patch /usr/src/app/
RUN patch -p0 < iconv-lite_to_jconv.patch

COPY auth_hangouts.js imap2hangouts.js config.js run.sh /usr/src/app/

CMD [ "./run.sh" ]

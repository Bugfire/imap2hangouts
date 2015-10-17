build:
		docker build -t imap2hangouts .

auth:
		docker rm auth
		docker run --name auth -it imap2hangouts /usr/src/app/auth_hangouts.js
		docker cp auth:/usr/src/app/node_modules/hangupsjs/cookies.json .
		docker cp auth:/usr/src/app/node_modules/hangupsjs/refreshtoken.txt .
		docker rm auth

run:
		docker run imap2hangouts

shell:
		docker run -it imap2hangouts bash

clean:
		docker ps -a | grep -v "CONTAINER" | awk '{print $$1}' | xargs docker rm
		docker images -a | grep "^<none>" | awk '{print $$3}' | xargs docker rmi

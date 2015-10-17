build:
		docker build -t imap2hangouts .

run:
		docker rm imap2hangouts || true
		docker run -d --name imap2hangouts --volume=`pwd`/data:/data imap2hangouts

stop:
		docker kill imap2hangouts || true
		docker rm imap2hangouts || true

logs:
		docker logs imap2hangouts

clean:
		docker ps -a | grep -v "CONTAINER" | awk '{print $$1}' | xargs docker rm
		docker images -a | grep "^<none>" | awk '{print $$3}' | xargs docker rmi

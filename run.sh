#!/bin/bash

cd /usr/src/app

node_modules/forever/bin/forever start --minUptime 1000 --spinSleepTime 1000 imap2hangouts.js
exec node_modules/forever/bin/forever --fifo logs 0

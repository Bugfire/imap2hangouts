#!/usr/bin/env node

/*
 */

function log(msg) {
  console.log((new Date()).toString() + ': ' + msg);
}

// -- MAIL

var Inbox = require('inbox');
var MailParser = require('mailparser').MailParser;
var fs = require('fs');
var config = require('/data/config.js');

var retry = 0; // 連続retryカウンタ
var t_retry = 0; // 1時間以内retryカウンタ
var cnt_connect = 0; // コネクト回数

function imap_connect() {
  var imap = Inbox.createConnection(
    false, 'imap.gmail.com', {
      secureConnection: true,
      auth : config.mail.auth
    }
  );

  imap.on('connect', function() {
    log('imap connected');
    cnt_connect++;
    retry = 0;
    (function (t) {
      setTimeout(function() {
        // 1時間次のコネクトしなければt_retryをリセット
        if (t == cnt_connect) {
          log('imap connect counter resetted');
          t_retry = 0;
        }
      }, 3600 * 1000);
    })(cnt_connect);
    imap.openMailbox('INBOX', { readOnly : false }, function(error) {
      if (error) {
        log('imap openMailbox error: ' + error);
        imap.close();
        return;
      }
      imap.search({ unseen : true }, true, function(error, result) {
        log('imap unseen: ' + JSON.stringify(result));
        if (error) {
          log('imap openMailbox error: ' + error);
          imap.close();
          return;
        }
        var check_unseen = function(list) {
          if (list.length == 0) {
            return;
          }
          var t = list.shift();
          fetch_mail(t, function(error) {
            check_unseen(list);
          });
        };
        check_unseen(result);
      });
    });
  });

  imap.on('close', function() {
    log('imap disconnected');
    var wait;
    if (retry == 0 && t_retry < 10) {
      wait = 100;
    } else if (retry < 10 && t_retry < 20) {
      wait = 5 * 1000;
    } else {
      wait = 120 * 1000;
    }
    setTimeout(function() {
      log('imap try reconnect');
      retry++;
      t_retry++;
      imap_connect();
    }, wait);
  });

  imap.on('error', function(message) {
    log('imap error\n' + message);
  });

  var fetch_mail = function(uid, callback) {
    var stream = imap.createMessageStream(uid);
    var mailParser = new MailParser();
    mailParser.on('end', function(mail) {
      mail.uid = uid;
      if (typeof mail.attachments !== 'undefined' && mail.attachments.length > 0) {
        var a = mail.attachments[0];
        var filename = a.fileName;
        var content = a.content;
        var tmpFilename = '/tmp/' + filename;
        fs.writeFile(tmpFilename, content, function (err) {
          if (err)
            return check_mail(mail, null, callback);
          check_mail(mail, tmpFilename, callback);
        });
      } else {
        check_mail(mail, null, callback);
      }
    })
    stream.on('error', function() {
      log('imap stream error: ' + uid);
      callback({ message : 'stream error' });
    });
    stream.pipe(mailParser)
  }

  var check_mail = function(mail, file, callback) {
    log('message\n' +
        'name: ' + mail.from[0].name + ' ' + mail.from[0].address + '\n' +
        'subject: ' + mail.subject);

    config.mail_filter(mail.from[0].address, mail.subject, mail.text,
        function(subject, body) {
            if (typeof subject !== "undefined" && typeof body !== "undefined") {
                send_hangouts(subject, body, file);
                imap.addFlags(mail.uid, [ '\\Seen' ],
                    function(err, flags) {
                        callback(err);
                    }
                );
            } else {
                log('IGNORED: ' + mail.uid);// + JSON.stringify(mail));
                callback(null);
            }
        }
    );
  };

  imap.on('new', function(message) {
    log('imap new:');
    fetch_mail(message.UID, function(error) {});
  });

  imap.on('error', function(message) {
    log('imap error: ' + message);
  });

  log('imap connect');
  imap.connect();
};

imap_connect();

// -- HANGOUTS

var Hangup = require('hangupsjs');

var creds = function() {
  return {
    auth : function() { return config.auth; }
  };
};

var hangout_queue = [];
var hangout_running = false;

function send_hangouts(title, message, imageFilename) {
  if (false) {
    log("DEBUG:");
    log("title:" + title);
    log("message:" + message);
    log("image:" + imageFilename);
    return;
  }

  var bld = new Hangup.MessageBuilder()
  var segments = bld.bold(title + '\n').text(message).toSegments()

  hangout_queue.push({ title : title, message : message, imageFilename : imageFilename, segments : segments });

  if (hangout_running == false)
    hangout_connect();
}

//createconversation(chat_ids, force_group=true);
//updatewatermark(conversation_id, timestamp);

function hangout_connect() {
  if (hangout_running == true)
    return;

  var retry_hangout_connect = function() {
    hangout_running = false;
    setTimeout(function() {
      hangout_connect();
    }, 3000);
  };

  hangout_running = true;
  var hangup = new Hangup({ 
      cookiespath : "/data/cookies.json",
      rtokenpath : "/data/refreshtoken.txt"
  });
  //hangup.loglevel('debug');

  var post_messages = function() {
    var cur = hangout_queue.shift();
    var t;
    if (typeof cur.imageFilename !== 'undefined' && cur.imageFilename != null) {
      t = hangup.uploadimage(cur.imageFilename);
      t = t.then(function(i) {
        log('hangup 1:' + i + '/' + cur.message);
        fs.unlinkSync(cur.imageFilename);
        cur.imageFilename = null;
        cur.image_id = i;
        return hangup.sendchatmessage(config.conv_id, cur.segments, cur.image_id);
      });
    } else if (typeof cur.image_id !== 'undefined' && cur.image_id != null) {
      t = hangup.sendchatmessage(config.conv_id, cur.segments, cur.image_id);
    } else {
      t = hangup.sendchatmessage(config.conv_id, cur.segments);
    }
    t = t.then(function() {
      if (hangout_queue.length == 0) {
        log('hangup disconnect');
        hangout_running = false;
        return hangup.disconnect();
      } else {
        post_messages();
      }
    });
    t.catch(function() {
      log('hangup error');
      retry_hangout_connect();
      return hangup.disconnect();
    });
  };

  hangup.on('chat_message', function(ev) {
    return log('chat_message: ' + ev);
  });

  hangup.on('connect_failed', retry_hangout_connect);

  hangup.connect(creds)
        .then(function() { post_messages(); })
        .catch(function() { retry_hangout_connect(); });
};

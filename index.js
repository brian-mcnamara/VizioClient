let smartcast = require('vizio-smart-cast');
let config = require('config');
let btoa = require('btoa');
let wakeOnLan = require('node-wol');
let eventsource = require('eventsource');
let directv = require('directv-remote');
var http
if (config.useHttps) {
  console.log('https enabled');
  http = require('https');
} else {
  http = require('http');
}

console.log('configuration:' + JSON.stringify(config));

let headers= {
  headers : {
    Authorization: 'Basic ' + btoa(config.mq.username + ':' + config.mq.token),
    'Content-Type' : 'application/json'
  }
};

let dtv = new directv.Remote(config.directv.ip);

let tv = new smartcast(config.tv.ip);
tv.pairing.useAuthToken(config.tv.token);

function handleMessage(message) {
  console.log('Handling message' + JSON.stringify(message));
  switch (message.message) {
    case 'powerOn':
      console.log('turning on');
      wakeOnLan.wake(config.tv.mac,
        tv.control.power.on);
      break;
    case 'powerOff':
      console.log('turning off');
      tv.control.power.off();
      break;
    case 'mute':
      console.log('muteing');
      tv.control.volume.mute();
      break;
    case 'unmute':
      console.log('unmuteing');
      tv.control.volume.unmute();
      break;
    case 'pause':
      console.log('pausing');
      dtv.processKey('pause');
      tv.control.media.pause();
      break;
    case 'play':
      console.log('playing');
      dtv.processKey('play');
      tv.control.media.play();
      break;
    case "FastForward" :
      console.log('FF');
      dtv.processKey('advance');
      tv.control.media.seek.forward();
      break;
    case 'Rewind' :
      console.log('RW');
      dtv.processKey('replay');
      tv.control.media.seek.back();
      break;
    case 'Stop':
      console.log('Stop');
      dtv.processKey('Exit');
      tv.control.navigation.exit();
      break;
    case 'Next':
      console.log('Next');
      for (var i = 0; i < 6; i++) {
        //6 seems to be the right number for commercials
        setTimeout(() => {dtv.processKey('advance');}, i * 750);
      }
    default:
      console.log('unimplemented message: ' + message.message);
  }

}

//TODO queued commands...
var address = (config.useHttps ? 'https://' : 'http://')
              + config.mq.host + ':' + config.mq.port + '/api/stream/queue/' + config.clientId;
console.log('connecting to:' + address);
function startStream() {
  var es = new eventsource(address, headers);
  es.addEventListener('message', message => {
    console.log("recieved message" + message);
    if (!!message) {
      var data = JSON.parse(message.data);
      if (!!data) {
        handleMessage(data);
      }
    }
  });
  es.onerror = function(err) {
    es.close();
    setTimeout(startStream, 5000);
  }
}
startStream();

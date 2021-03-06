const { Samsung, KEYS, APPS } = require('samsung-tv-control')
let config = require('config');
let btoa = require('btoa');
let wakeOnLan = require('node-wol');
let eventsource = require('eventsource');
let directv = require('directv-remote');
let didyoumean = require('didyoumean');
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
let ca = config.directv.clientAddr;
const tvConfig = {
  ip : config.tv.ip, 
  mac: config.tv.mac, 
  nameApp: "tv-controller", 
  port : 8002,
  token: config.tv.token
}

let tv = new Samsung(tvConfig);

let channelMap = config.channels || {}

function handleMessage(message) {
  //console.log('Handling message' + JSON.stringify(message));
  switch (message.message) {
    case 'powerOn':
      console.log('turning on');
      tv.turnOn();
      break;
    case 'powerOff':
      console.log('turning off');
      tv.sendKey(KEYS.KEY_POWER);
      break;
    case 'mute':
      console.log('muteing');
      tv.sendKey(KEYS.KEY_MUTE);
      break;
    case 'unmute':
      console.log('unmuteing');
      tv.sendKey(KEYS.KEY_MUTE);
      break;
    case 'pause':
      console.log('pausing');
      dtv.processKey('pause', ca);
      tv.sendKey(KEYS.KEY_PAUSE);
      break;
    case 'play':
      console.log('playing');
      dtv.processKey('play', ca);
      tv.sendKey(KEYS.KEY_PLAY);
      break;
    case "FastForward" :
      console.log('FF');
      dtv.processKey('advance', ca);
      break;
    case 'Rewind' :
      console.log('RW');
      dtv.processKey('replay', ca);
      break;
    case 'Stop':
      console.log('Stop');
      dtv.processKey('Exit', ca);
      break;
    case 'Next':
      console.log('Next');
      for (var i = 0; i < 6; i++) {
        //6 seems to be the right number for commercials
        setTimeout(() => {dtv.processKey('advance', ca);}, i * 750);
      }
      break;
    case 'AdjustVolume':
      console.log('adjusting volume');
      const value = message.parameters.value;
      if (value > 0) {
        tv.sendKey(KEYS.KEY_VOLUP);
      } else {
        tv.sendKey(KEYS.KEY_VOLUP);
      }
      break;
    case 'SelectInput':
      const input = message.parameters.input;
      var inputList = ["HDMI1", "HDMI2", "HDMI4"];
      var inputClosest = didyoumean(input, inputList);
      if (! inputClosest) {
        console.log('could not find closest: ' + input + ' from: ' + inputList);
        return;
      }
      console.log('setting input: ' + inputClosest);
      if(inputClosest === "HDMI1") {
        tv.sendKey(KEYS.KEY_HDMI1);
      } else if (inputClosest === "HDMI2") {
        tv.sendKey(KEYS.KEY_HDMI2);
      } else if (inputClosest === "HDMI4") {
        tv.sendKey(KEYS.KEY_HDMI4);
      }
      break;
    case 'ChangeChannel':
      const channel = JSON.parse(message.parameters.channel);
      if (channel.channelMetadata.name) {
          let channelName = channel.channelMetadata.name;
          console.log("Trying to find channel name " + channelName);
          let guess = didyoumean(channelName, Object.keys(channelMap));
          if (!!guess) {
              console.log("Switching to channel " + channelMap[guess])
              dtv.tune(channelMap[guess], ca)
          }
      } else if (channel.channel.number) {
          console.log("Switching to channel " + channel.channel.number)
          dtv.tune(channel.channel.number, ca)
      }
      break;

    case 'DoubleDown':
      realPause().then(doubleDown);
      break;
    case 'ping':
	    //ping message
	    break;
    default:
      console.log('unimplemented message: ' + message.message);
  }

}

async function realPause() {
   let currentOffset = await getOffset();
   return new Promise((resolve, reject) => {
      setTimeout(_ => {
         getOffset().then(newOffset => {
            if ((newOffset < 7200 && newOffset != currentOffset) || (newOffset >= 7200 && newOffset - 1 != currentOffset)) {
               dtv.processKey('pause', ca)
            }
            resolve()
         });
      }, 1000)
   })

}

async function getOffset() {
   return getTuned().then(value => {
      return value.offset;
   })
}

async function doubleDown() {
    var currentOffset = await getOffset();

    return processKey('down').then(_ => new Promise((resolve) => {
        setTimeout(resolve, 1000);
    })).then(getOffset).then(newOffset => {
        if (currentOffset == newOffset) {
            processKey('down')
        }
    });
}

async function getTuned() {
    return new Promise((resolve, reject) => {
        dtv.getTuned(ca, function(err, resp) {
            if (!!err) {
                reject(err)
            } else {
                resolve(resp)
            }
        })
    })
}

async function processKey(key) {
    return new Promise((resolve, reject) => {
        dtv.processKey(key, ca, function(err, resp) {
            if (!!err) {
                reject(err)
            }
            resolve()
        })
    })
}

//TODO queued commands...
var address = (config.useHttps ? 'https://' : 'http://')
              + config.mq.host + ':' + config.mq.port + '/api/stream/queue/' + config.clientId;
console.log('connecting to:' + address);
function startStream() {
  var es = new eventsource(address, headers);
  es.addEventListener('message', message => {
    console.log("recieved message" + JSON.stringify(message));
    if (!!message) {
      var data = JSON.parse(message.data);
      if (!!data) {
        try {
          handleMessage(data);
        } catch (e) {
          console.error(e);
        }
      }
    }
  });

  es.onerror = function(err) {
    //setTimeout(_ => {
    //    if (es.readyState === eventsource.CLOSED) {
    //        es.close();
    //        setTimeout(startStream, 5000);
    //    }
    //}, 0);
  }
  setTimeout(() => {
    es.close();
    startStream();
  }, 360000)
}
startStream();

let smartcast = require('vizio-smart-cast');
let config = require('config');
let btoa = require('btoa');
let wakeOnLan = require('node-wol');
let eventsource = require('eventsource');
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

let http_config = {
  host : config.mq.host,
  port: config.mq.port,
  path : '/api/queue/' + config.clientId,
  method: 'get',
  headers : headers
};

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
      tv.control.volue.mute();
      break;
    case 'unmute':
      console.log('unmuteing');
      tv.control.volume.unmute();
      break;
    case 'pause':
      console.log('pausing');
      break;
    default:
      console.log('unimplemented message: ' + message.message);
  }

}

//Legacy
/*(function makeRequest() {
  console.log('Polling mq');
  var req = http.request(http_config, (res) => {
    res.on('data', (data) => {
      console.log('Data recieved ' + data);
      data = JSON.parse(data);
      if (!!data && data.length > 0) {
        data.forEach(handleMessage);
      }
    });
    console.log('Setting timeout');
    setTimeout(makeRequest, config.pollTime);
  });
  req.end();
});*/
//TODO queued commands...
var address = (config.useHttps ? 'https://' : 'http://')
              + config.mq.host + ':' + config.mq.port + '/queue/' + config.clientId;
console.log('connecting to:' + address);
var es = new eventsource(address, headers);
es.addEventListener('message', message => {
  console.log("recieved message" + message);
  if (!!message) {
    var data = JSON.parse(message.data);
    if (!!data) {
      handleMessage(data);
    }
  }
})

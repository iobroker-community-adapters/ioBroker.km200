/**
 *
 * Buderus KM200 Adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var request =       require('request');
var async =         require('async');
var util =          require('util');
var http =          require('http');
var MCrypt =        require('mcrypt').MCrypt;
var EventEmitter =  require('events').EventEmitter;

function objToString(obj,level) {    return  util.inspect(obj, false, level || 2, false).replace(/\n/g,' ');}

function safeJson(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 


// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = utils.adapter('km200');

//adapter.log.info('Adapter SW loading');


function KM200() {
    if (!(this instanceof KM200)) return new KM200(url);
//    EventEmitter.call(this);
    var that =      this;
    that.crypt =    null;
    that.aesKey =   null;   // buffer will be generated on init from accessKey
    that.options =  null;
    that.scannedServices = null;
    that.blocked =  [];
    that.pushed =   [];
    that.basicServices =    [
        "/dhwCircuits",
    	"/gateway",
    	"/heatingCircuits",
    	"/heatSources",
    	"/notifications",
    	"/recordings",
    	"/solarCircuits",
    	"/system",
    ];
/*  
 *  initialize  KM200
 *  accessUrl = string  z.b. 192.168.1.xxx oder wie bei mir BuderusKM200.fritz.box
 *  accessPort = sollte 80 sein außer er ist über den Router umgebogen :), wenn leer oder 0 wird er auf 80 gesetzt
 *  accessKey = hex string like 'b742c3085bcaeac989353b7655c016dda46e567fe6e8a609e8ea796e20a78a33' which you got from https://ssl-account.com/km200.andreashahn.info/
 *  pollTime = in wie vielen Minuten werden 
 */
    that.init = function(accessUrl,accessPort,accessKey) {
        if (!accessUrl || !accessKey) 
            return adapter.log.warn('KM200.init argument error:init('+accessUrl+', '+accessPort+', '+accessKey+'), no init done!');
        that.aesKey =   new Buffer(accessKey,'hex');
        that.scannedServices = null;
        that.blocked =      [];
        that.crypt =    new MCrypt('rijndael-128', 'ecb');
        that.crypt.open(that.aesKey);
        that.options = JSON.stringify(
            {
                hostname: accessUrl,
                port: accessPort && parseInt(accessPort)>0 ? parseInt(accessPort) : 80,
                headers: {
                    'agent': 'TeleHeater/2.2.3',
                    'User-Agent': 'TeleHeater/2.2.3',
                    'Accept': 'application/json',
                }
            });
//        adapter.log.info("KM200 init("+accessUrl+', '+accessPort+', '+accessKey+') done!');
    };


    that.addBlocked = function(list) {
        if (!list)
            return adapter.log.warn('KM200.setBlocked no list provided as argument!');
        if (!Array.isArray(list))
            list = [list];
        for(var i=0; i<list.length;i++) {
            var li = list[i];
            var ispush = false;
            if (li.startsWith('+')) {
                li = li.slice(1,li.length);
                ispush = true;
            } else if (li.startsWith('-'))
                li = li.slice(1,li.length);
            if (!li.startsWith('^/')) {
                if (!li.startsWith('/')) {
                    if (!li.startsWith('^')) 
                        li = '^/' + li;
                    else
                        li = '^/' + li.slice(1,li.length);
                } else 
                    li = '^'+li;
            }
            if (!li.endsWith('$'))
                li +='$';
            var j = li.indexOf('*');
            if (j>1 && li[j-1]!='.') 
                li = li.slice(0,j) +'.' +li.slice(j,li.length); 
            (ispush? that.pushed : that.blocked).push(new RegExp(li));
        }
    };

/*  
 *  Get data from KM200
 *  service = string of service like '/system' to access
 *  callback(err,data) with received data, either an array or an object
 */
    that.get = function(service,callback) { 
        if (!callback) 
            return adapter.log.warn('KM200.get without callback parameter! Will not work!');
        if (!service || service.length<2 || service[0]!=='/') {
            var e = "KM200.get service parameter not as requested '"+objToString(service)+"'";
            adapter.log.warn(e);
            return callback(e);
        }
        if (!that.crypt || !that.options) {
            var err = "KM200.get not initialized! Will not work"+objToString(service)+"'";
            adapter.log.warn(err);
            return callback(err);
        }
        var data = new Buffer('');
        var resp = null;
        var opt = JSON.parse(that.options);
        opt.method = 'GET';
        opt.path = service;
        http.get(opt, function (response) {
            response.setEncoding('utf8');
            if (response.statusCode!=200) {
                var e = "KM200.get Resp status not 200:"+response.statusCode;
                return callback(e);
            }
            resp = response;
            resp.on('data', function (buf) {
                data += buf;
              }).on('error', function (err) {
                adapter.log.warn('KM200.get Error from response: '+ objToString(err));
                data = null;
                callback(err);
              }).on('end', function (buf) {
                if (!data)
                    return;
                var b = new Buffer(data, 'base64');
                var o = null;
                try {
                    var s = b.toString('hex');
                    s = that.crypt.decrypt(b).toString('utf8');
                    while (s.charCodeAt(s.length-1)===0)
                        s = s.slice(0,s.length-1);
                    o = JSON.parse(s);
                } catch(e) {
                    var ce = "KM200 Error, most probabloy Key not accepted "+e;
                    return callback(ce);
                }
                if (o && o.references) 
                    o = o.references;
                callback(null,o);
              });
        }).on('error',callback);
    };

    that.set = function(service,value,callback) {
        var text = {};
        text.value = value;
        text = JSON.stringify(text);
        var bs = that.crypt.getBlockSize();
        text = that.crypt.encrypt(text).toString('base64');
        var opt = safeJson(that.options);
        opt.headers["Content-Type"] = "application/json";
        opt.path = service;
        opt.method = 'POST';
//        opt.headers['Content-Length'] = Buffer.byteLength(text);
        var data = new Buffer('');
        var req = http.request(opt, function(res) {
            res.setEncoding('utf8');
            res.on('data', function(chunk) {
                data += chunk;
            });
            res.on('end', function() {
                res.removeAllListeners();
                callback(null,data);
            });
        });
        
        req.on('error', function(e){
          adapter.log.warn('On Error: problem with request: ' +e.message);
          req.removeAllListeners();
          callback(e,null);
        });
        // write data to request body
        req.end(text);
    };

    function isBlocked(id) {
        for (var i=0;i<that.pushed.length;++i) {
            if(that.pushed[i].test(id)) {
//                adapter.log.info(id+ ' was found in pushed with ' + that.pushed[i] );
                return false;
            }
        }
        for (var i=0;i<that.blocked.length;++i) {
            if(that.blocked[i].test(id)) {
//                adapter.log.info(id+ ' was found in blocked with ' + that.blocked[i] );
                return true;
            }
        }

//        adapter.log.info(id+ ' was not found!');

        return false;
    }
    
    that.getServices = function(callback) {
        if(!callback)
            adapter.log.warn('KM200 getServices no callback');
        var nlist = [].concat(that.basicServices);
        var services = {};
        that.scannedServices = null;
        async.whilst(
            function() {return nlist.length>0}, 
            function(callb) {
                var item = nlist.shift();
                
                that.get(item,function(err,data) {
                    if (err || !data) 
                        return callb(null);
                    if (Array.isArray(data)) {
                        for (var i = 0; i< data.length; ++i) {
                            var di = data[i];
                            if (di && di.id && di.uri && !isBlocked(di.id)) {
                                nlist.push(di.id);
                            }
                        }
                    } else if (!isBlocked(item)) {
                        if (data.setpointProperty)
                            nlist.push(data.setpointProperty.id);
                        if (data.recordedResource)
                            nlist.push(data.recordedResource.id);
                        var objl = item.split('/');
                        objl = objl.slice(1,objl.length).join('.');
//                        adapter.log.info(objl + " = " + objToString(data.value));
                        services[objl]= data;
                    } 
                    setTimeout(callb,100); // just wait some time to give us the chance recover :)
                });
                     
            },function (err) {
                
                var s = Object.keys(services);
                if(s.length === 0) {
                    return callback("Didi not get any Services from KLM200!: "+ objToString(services));
                }
                s.sort();
                var ns = {};
                for(var i=0; i<s.length; ++i) {
                    ns[s[i]] = services[s[i]];
                }
                that.scannedServices = ns; 
                
                callback(null,that.scannedServices);          
            });
    };    
}

//util.inherits(KM200, EventEmitter);

var km200 = new KM200();

var mtimeout = null;

var setDel = {};


// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        if (mtimeout)
            clearTimeout(mtimeout);
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + objToString(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    if (setDel[id])
        clearTimeout(setDel[id]);
    setDel[id] = null;
    // Warning, state can be null if it was deleted
//    adapter.log.info(adapter.instance + ' stateChange ' + id + ' ' + objToString(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack && !state['from'].endsWith('km200.'+adapter.instance)) {
//        adapter.log.info(id+' stateChange to '+ objToString(state));
        var serv = '/'+id.split('.').slice(2).join('/');
//        adapter.log.info("km200.set "+serv+" = "+state.val);
        km200.set(serv, state.val, function(err,data) {
            if(err)
                adapter.log.warn('Set KM200 err: '+ objToString(err));
            else {
                adapter.log.info("Set "+id+ " to " + state.val);
//                adapter.log.info('KM200.set '+serv + " changed to "+state.val);
                var ids = id.split('.').slice(2).join('.');
                var ite = {};
                ite[ids] = states[ids];
                if (setDel[id])
                    clearTimeout(setDel[id]);
//                adapter.log.info('Set KM200 returned: '+ objToString(ite));
                setDel[id] = setTimeout(updateStates,5000,id);
            }
        });
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            adapter.log.info('KM200 send command from message');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

var states = {};

function minutes(min) {
        var val = min*1000*60;
        var d = Math.floor(val /(1000*60.0*60*24));
        return (d>0 ? d.toString()+"-" : "" ) + new Date(val).toUTCString().split(" ")[4].slice(0,5);
        
}

function createStates() {
        states = {};
// I got Types:{ floatValue: 89, stringValue: 36, switchProgram: 4, systeminfo: 3, errorList: 1, yRecording: 8, arrayData: 5 }
//       Units:{ C: 34, undefined: 57, 'l/min': 1, mins: 7, '%': 12, kW: 13, 'µA': 2, Pascal: 2, kWh: 6, 'kg/l': 2, ' ': 6, 'l/h': 2, bar: 2 }
// looks like: { id: 146,   type: 146,   writeable: 146,   recordable: 142,   value: 125,   unitOfMeasure: 89,   
//      allowedValues: 27,   setpointProperty: 4,   maxNbOfSwitchPoints: 4,   maxNbOfSwitchPointsPerDay: 4,   switchPointTimeRaster: 4,   
//      switchPoints: 4,   minValue: 12,   maxValue: 12,   values: 9,   recordedResource: 8,   interval: 8,   sampleRate: 8,   
//      'recording-type': 8,   recording: 8 }
        async.forEachOfSeries(km200.scannedServices,function(o,n,callb)  {
            var t = o.type;
            var u = o.unitOfMeasure;
            var v = o.value;
            o.valIs = "value";
            if (v == -3276.8)
                return callb(null);
            var w = !!o.writeable;
            var r =  w ? 'level' : 'value';
            if (u === 'C') {
                u = '°C';
                r += '.temperature';
            } else if(typeof u === 'undefined)')
                u = "";
            switch(t) {
                case 'stringValue':
                    t = 'string';
                    break;
                case 'floatValue':
                    t = 'number';
                    break;
                case 'systeminfo':
                case 'errorList':
                case 'arrayData':
                    v = o.values;
                    o.valIs = "values";
                    t = 'array';
                    w = false;
                    break;
                case 'switchProgram':
                    v = o.switchPoints;
                    o.valIs = "switchPoints";
                    t = 'array';
                    w = false;
                default:        // don't process others'
                    return callb(null);
            }
            if (u=='mins') {
                t = 'string';
                v = minutes(parseInt(v));
            }
            var c = {
                type: 'state',
                common: {
                    name:   n,
                    type:   t,
                    unit:   u,
                    read:   true,
                    write:  w,
                    role:   r,
                },
                native : {
               }
            };
            if (typeof o.minValue !== 'undefined')
                c.common.min = o.minValue;
            if (typeof o.maxValue !== 'undefined')
                c.common.max = o.maxValue;
            c.native.km200 = o;
            states[n]=c;
            adapter.setObject(n,c,function(err) {
                adapter.log.info(n+" "+ objToString(c));
                adapter.setState(n, { 
                    val:v, 
                    ack:true, 
                    ts: Date.now(),
                },  function(err) {
                    callb(null);
                });
            });
        }, function(err) {
            var st = Object.keys(states)
            adapter.log.info("KM200 finished creation of "+ st.length + " states: "+ objToString(st));
            adapter.subscribeStates('*'); // subscribe to states only now, but after we managed to write the TODO:
        });
}

function updateStates(items) {
//    adapter.log.info("updateStates Tried to update "+objToString(items));
    if (mtimeout) clearTimeout(mtimeout);
    mtimeout = null;
    if (typeof items === 'string') {
        var ai = adapter.name + '.' + adapter.instance +'.';
        if (items.startsWith(ai))
            items = items.slice(ai.length,items.length);
        if (setDel[items]) {
            clearTimeout(setDel[items]);
            setDel[items] = null;
        }    
        var ni = {};
        ni[items]= states[items];
        if (!states[items]) {
            return adapter.log.info('Could not find state for '+ items);
        } else adapter.log.info('Update '+ objToString(ni));
        items = ni;
    } else if(!items)
        items = states 
    async.forEachOfSeries(items,function(o,n,callb)  {
        var km = o.native.km200;
        km200.get(km.id, function (err,data){
            if (err)    // just skip at the moment
                return callb(null);
            var val = data[km.valIs];
            if (km.unitOfMeasure=='mins')
                val = minutes(parseInt(val));
            adapter.setState(n, { 
                val:val, 
                ack:true, 
                ts: Date.now(),
            },  function(err) {
                adapter.log.info("Updated '"+n+"' = "+objToString(val));
                setTimeout(callb,100,null); // delay next request by 100ms to give the network a time :)
            });
        });
    }, function (err) {
        if (err)
            adapter.log.warn('UpdateStates returned Error: '+objToString(err));
    }); 
    mtimeout = setTimeout(updateStates,adapter.config.interval*1000*60);
}

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    if (mtimeout) clearTimeout(mtimeout);

    if(parseInt(adapter.config.interval)<5)  
        adapter.config.interval = 5;
    adapter.config.port = parseInt(adapter.config.port);
    if (!adapter.config.adresse || adapter.config.adresse.length<2)
        adapter.log.warn('config KM200 Addresse not available or too short: ' + adapter.config.adresse);
    
    adapter.config.accesskey = adapter.config.accesskey.trim();
    if (!adapter.config.accesskey || adapter.config.accesskey.length!=64)
        adapter.log.warn('config KM200 AccessKey seems to be invalid (need to be a hex string of 64 characters): ' + objToString(adapter.config.accesskey));

    adapter.log.info('KM200 adresse: http://' +  adapter.config.adresse + ':' + adapter.config.port);
    adapter.log.info('Interval='+adapter.config.interval+', Black/Push-list: ' + adapter.config.blacklist);

    km200.init(adapter.config.adresse,adapter.config.port,adapter.config.accesskey);

    var blacklist = safeJson(adapter.config.blacklist);

    if (blacklist && Array.isArray(blacklist))
        km200.addBlocked(blacklist);
    else
        adapter.log.warn("KM200: invalid blacklist:'"+adapter.config.blacklist+"'");

    km200.getServices(function(err,obj){

        if(!obj || Object.keys(obj) === 0) {
            return adapter.log.error("Did not get any Services from KLM200!: "+ objToString(obj));
        }
//        var fs = require('fs');
//        fs.writeFile("Services.txt",util.inspect(obj,false,4,false));
        createStates();
        mtimeout = setTimeout(updateStates,adapter.config.interval*1000*60);
//        adapter.log.info("Services: "+ objToString(obj));
    });

}

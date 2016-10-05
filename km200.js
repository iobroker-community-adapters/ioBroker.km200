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
    that.blocked =  [];
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
    that.services =     {};
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
        that.services =     [];
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
        adapter.log.info("KM200 init("+accessUrl+', '+accessPort+', '+accessKey+') done!');
    };


    that.addBlocked = function(list) {
        if (!list)
            return adapter.log.warn('KM200.setBlocked no list provided as argument!');
        if (!Array.isArray(list))
            list = [list];
        for(var i=0; i<list.length;i++) {
            var li = list[i];
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
            that.blocked.push(new RegExp(li));
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
            var e = "KM200.get service parameter not as requested '"+service+"'";
            adapter.log.warn(e);
            return callback(e);
        }
        if (!that.crypt || !that.options) {
            var err = "KM200.get not initialized! Will not work"+service+"'";
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

    function isBlocked(id) {
        for (var i=0;i<that.blocked.length;++i) {
            if(that.blocked[i].test(id))
                return true;
        }
        return false;
    }
    
    that.getServices = function(callback) {
        if(!callback)
            adapter.log.warn('KM200 getServices no callback');
        var nlist = [].concat(that.basicServices);
        that.services = {};

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
                        var objl = item.split('/');
                        objl = objl.slice(1,objl.length).join('.');
                        adapter.log.info(objl + " = " + objToString(data.value));
                        that.services[objl]= data;
                    }
                    setTimeout(callb,100); // just wait some time to give us the chance recover :)
                });
                     
            },callback);
    };    
}

//util.inherits(KM200, EventEmitter);

var km200 = new KM200();

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
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
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + objToString(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        // TODO: set value on KM200
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

var mtimeout = null;

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    if (mtimeout) clearTimeout(mtimeout);

    adapter.log.info('config KM200 Addresse: ' + adapter.config.adresse);
    adapter.log.info('config KM200 Addresse: ' + adapter.config.port);
    adapter.log.info('config KM200 Addresse: ' + adapter.config.accesskey);
    adapter.log.info('config KM200 Addresse: ' + adapter.config.blacklist);
    adapter.log.info('config KM200 Addresse: ' + adapter.config.interval);

    km200.init(adapter.config.adresse,adapter.config.port,adapter.config.accesskey);

    var blacklist = safeJson(adapter.config.blacklist);

    if (blacklist && Array.isArray(blacklist))
        km200.addBlocked(blacklist);
    else
        adapter.log.warn("KM200: invalid blacklist:'"+adapter.config.blacklist+"'");

    km200.getServices(function(err,obj){
        var s = Object.keys(km200.services);
        if(s.length === 0) {
            return adapter.log.error("Didi not get any Services from KLM200!: "+ objToString(km200.services));
        }
        for(var i in km200.services) {
//                        adapter.log.info(i);

//            adapter.log.info(i+" = "+km200.services[i]);
        }

    });
/*
        async.forEachOfSeries(myKM200.names,function(o,n,callb)  {

            var t =     o.type;
            var c = {
                type: 'state',
                common: {
                    name:   o.lname,
                    type:   'boolean',
                    unit:   o.unit,
                    read:   true,
                    write:  true,
                    role:   'switch'
                },
                native : {
                    desc:       JSON.stringify(o),
                    isSensor:   (o["state"] !==undefined),
                    xs1Id:      o.id
                }
            };

            var r = myXS1.getRole(t);
            if (r) {
                c.common.role =r;
                c.common.type = myXS1.getType(t);
                if (c.common.type === 'boolean') {
                    o.val = (o.val === false || o.val === 0) ? false : !!o.val;
                    c.common.unit = "";
                }
                o.common = c.common;
                c.native.init = o;
                adapter.setObject(c.common.name,c,function(err) {
                    adapter.log.info(c.common.name+" "+ objToString(c));
                    adapter.setState(c.common.name, { 
                        val:c.native.init.val, 
                        ack:true, 
                        ts:c.native.init.utime*1000
                    },  function(err) {
                        callb(null);
                    });
                });
            } else {
                adapter.log.warn("Undefined type "+t + ' for ' + c.common.name);
                callb(null);
            }
        }, function(err) {
            adapter.log.info("finished states creation");
            adapter.subscribeStates('*'); // subscribe to states only now
        });

    });
*/  

}

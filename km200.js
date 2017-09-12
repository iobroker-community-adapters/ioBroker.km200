/**
 *
 * Buderus KM200 Adapter
 * v 0.4.2 2016.11.14
 */
// jshint node:true, esversion:6, strict:global, undef:true, unused:true
"use strict";
const util =          require('util');
const http =          require('http');
const MCrypt =        require('mcrypt').MCrypt;
const EventEmitter =  require('events').EventEmitter;

function _o(obj,level) {    return  util.inspect(obj, false, level || 2, false).replace(/\n/g,' ');} // Stringify an object until level
function _J(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+e}}} // Safe JSON parse
const _N = (a,b,c,d,e) => setTimeout(a,0,b,c,d,e); // Execute after next tick
function _D(l,v) { adapter.log.debug(l); return v === undefined ? l : v; } // Debug
function _DD(l,v) { return v === undefined ? l : v; } // Debug off
function _I(l,v) { adapter.log.info(l); return v === undefined ? l : v; } // Info
function _W(l,v) { adapter.log.warn(l); return v === undefined ? l : v; } // Warning
function _Co(o) { return _J(JSON.stringify(o));} // create a deep copy of te object o


function wait(time,arg) { return new Promise((res,rej) => setTimeout(res,time,arg))}

function c2pP(f) {
//    _D(`c2pP: ${_o(f)}`);
    return function () {
        const args = Array.prototype.slice.call(arguments);
        return new Promise((res, rej) => {
            args.push((err, result) => (err && _N(rej,err)) || _N(res,result));
            f.apply(this, args);
        });
    };
}

function pSeriesP(obj,promfn,delay) { // fun gets(item) and returns a promise
    delay = delay || 0;
    var p = Promise.resolve();
    const   nv = [],
            f = (k) => p = p.then(() => promfn(k).then(res => wait(delay,nv.push(res))));
    for(var item of obj) 
        f(item);
    return p.then(() => nv);
}
/*
function pSeriesF(obj,fun,delay) { // fun gets(item) and returns a value
    delay = delay || 0;
    var p = Promise.resolve();
    const   nv = [],
            f = (k) => p = p.then(() => Promise.resolve(fun(k)).then(res => wait(delay,nv.push(res))));
    for(var item of obj) 
        f(item);
    return p.then(() => nv);
}
*/
// you have to require the utils module and call adapter function
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
const adapter = utils.adapter('km200');

//adapter.log.info('Adapter SW loading');


function KM200() {
    if (!(this instanceof KM200)) return new KM200(url);
//    EventEmitter.call(this);
    const that =      this;
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
            return _W(`KM200.init argument error:init(${accessUrl}, ${accessPort}, ${accessKey}), no init done!`);
        that.aesKey =   new Buffer(accessKey,'hex');
        that.scannedServices = null;
        that.blocked =      [];
        that.crypt =    new MCrypt('rijndael-128', 'ecb');
        that.crypt.open(that.aesKey);
        that.options = {
            hostname: accessUrl,
            port: accessPort && parseInt(accessPort)>0 ? parseInt(accessPort) : 80,
            headers: {
                'agent': 'TeleHeater/2.2.3',
                'User-Agent': 'TeleHeater/2.2.3',
                'Accept': 'application/json',
            }
        };
        _D(`KM200 init(${accessUrl}, ${accessPort}, ${accessKey}) done!`);
    };


    that.addBlocked = function(list) {
        if (!list)
            return _W('KM200.setBlocked no list provided as argument!');
        if (!Array.isArray(list))
            list = [list];
//        for(let i=0; i<list.length;i++) {
//            let li = list[i];
        for(let li of list) {
            let ispush = false;
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
            const j = li.indexOf('*');
            if (j>1 && li[j-1]!='.') 
                li = li.slice(0,j) +'.' +li.slice(j,li.length); 
            (ispush? that.pushed : that.blocked).push(_D(`add to ${ispush? 'pushed' : 'blocked'} ${li}`, new RegExp(li)));
        }
    };

/*  
 *  Get data from KM200
 *  service = string of service like '/system' to access
 *  callback(err,data) with received data, either an array or an object
 */
    that.get = function(service,callback) { 
        if (!callback) 
            return _W('KM200.get without callback parameter! Will not work!');
        if (!service || service.length<2 || service[0]!=='/') 
            return callback(_W(`KM200.get service parameter not as requested '${_o(service)}'`));
        if (!that.crypt || !that.options) 
            return callback(_W(`KM200.get not initialized! Will not work ${_o(service)}'`));
        let data = new Buffer('');
        let resp = null;
        const opt = _Co(that.options);
        opt.method = 'GET';
        opt.path = service;
//        _D(_o(opt));
        http.get(opt, response =>  {
            response.setEncoding('utf8');
            if (response.statusCode!=200) 
                return callback(_D(`KM200.get Resp status not 200: ${_o(response.statusCode)}`));
            resp = response;
            resp.on('data',buf=> data += buf)
                .on('error', err => {
                    _W(`KM200.get Error from response: ${_o(err)}`);
                    data = null;
                    callback(err);
                }).on('end', buf => {
                    if (!data)
                        return callback('No Data');
                    const b = new Buffer(data, 'base64');
                    let o = null;
                    try {
                        let s = b.toString('hex');
//                        _D('fh'+s);
                        s = that.crypt.decrypt(b).toString('utf8');
                        while (s.charCodeAt(s.length-1)===0)
                            s = s.slice(0,s.length-1);
                        o = JSON.parse(s);
                    } catch(e) {
                        return callback(`KM200 response Error, most probabloy Key not accepted :${_o(e,3)}`);
                    }
                    if (o && o.references) 
                        o = o.references;
                    callback(null,o);
              });
        }).on('error',callback);
    };

    that.set = c2pP(function(service,value,callback) {
        let text = {};
        text.value = value;
        text = JSON.stringify(text);
        const bs = that.crypt.getBlockSize();
        text = that.crypt.encrypt(text).toString('base64');
        const opt = _Co(that.options);
        opt.headers["Content-Type"] = "application/json";
        opt.path = service;
        opt.method = 'POST';
//        opt.headers['Content-Length'] = Buffer.byteLength(text);
        const data = new Buffer('');
        const req = http.request(opt, function(res) {
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
    });

    function isBlocked(id) {
        for (let i=0;i<that.pushed.length;++i) 
            if(that.pushed[i].test(id)) 
                return _DD(`${id} is pushed`,false);
        for (let i=0;i<that.blocked.length;++i) 
            if(that.blocked[i].test(id))
                return _DD(`${id} is blocked`,true);
//        _D(`${id} is passed`);
        return false;
    }

    that.getServices = service => {
        let level = false;
        if (!service) {
            service = that.basicServices;
            that.scannedServices = {};
            level = true;
        }
        if (!Array.isArray(service))
            return Promise.reject(_I(`Invalid (not Array) getService for ${_o(service)}`));
        _D(`try to get services for ${_o(service)}`);
        return pSeriesP(service,item => {
            return c2pP(that.get)(item)
                .then(data => {
//                    _D(`get returned ${_o(data)}`)
                    if (Array.isArray(data)) {
                        return pSeriesP(data, di => {
//                            _D(`array had ${_o(di)}`)
                            if (di && di.id && di.uri && !isBlocked(di.id)) 
                                return that.getServices([di.id]);
                            return Promise.resolve();
                        },10)
                    } else {
                        if (!isBlocked(item)) {
                            if (data.setpointProperty)
                                return that.getServices(_D(`setPointProperty = ${data.setpointProperty.id}`,[data.setpointProperty.id]));
                            if (data.recordedResource)
                                return that.getServices(_D(`recordedResource = ${data.recordedResource.id}`,[data.recordedResource.id]));
                            const d = item.split('/').slice(1).join('.');
                            that.scannedServices[d] = data;
                            return Promise.resolve(_D(`Service[${d}]=${_o(data)}`,null));
                        }                        
                    }
                    return null;
                }).catch(err => _D(`could not get data for '${item} with err=${err}`))
        },50).then(() => {
            if (!level) return Promise.resolve();
            const s = Object.keys(that.scannedServices);
            if(s.length === 0) 
                return callback(`Did not get any Services from KLM200!: ${_o(that.scannedServices)}`);
            const ns = {};
            for(let i of s.sort()) 
                ns[i] = that.scannedServices[i];
            that.scannedServices = ns; 
            return ns;            
        });        
    };
}

//util.inherits(KM200, EventEmitter);

const km200 = new KM200();

var mtimeout = null;

const setDel = {};

var states = {};


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
adapter.on('objectChange', (id, obj) => _I(`objectChange ${id} ${_o(obj)}`));

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    if (setDel[id])
        clearTimeout(setDel[id]);
    setDel[id] = null;
    // Warning, state can be null if it was deleted
//    adapter.log.info(adapter.instance + ' stateChange ' + id + ' ' + _o(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack && !(state['from'] && state['from'].endsWith('km200.'+adapter.instance))) {
//        adapter.log.info(id+' stateChange to '+ _o(state));
        let iid = id.split('.').slice(2);
        const serv = '/'+iid.join('/');
        iid = iid.join('.');
//        adapter.log.info("km200.set "+serv+" = "+state.val);
        let val = state.val;
        iid = states[iid];
        if (iid && iid.common.states) { // convert states in ioBroker to allowed string values for KM200
            const sa = iid.common.states.split(';');
            val = sa[state.val].split(':')[1];
//            adapter.log.info('Check Converted for '+iid+' State '+_o(iid) + ' to ' + val);
        } 

        km200.set(serv, val)
            .then(data =>  {
                _I(`Set ${id} to ${state.val}`);
//                adapter.log.info('KM200.set '+serv + " changed to "+state.val);
                const ids = id.split('.').slice(2).join('.');
                const ite = {};
                ite[ids] = states[ids];
                if (setDel[id])
                    clearTimeout(setDel[id]);
//                adapter.log.info('Set KM200 returned: '+ _o(ite));
                setDel[id] = setTimeout(updateStates,5000,id);
            }).catch(err => _W(`Set KM200 err: ${_o(err)}`,err));
    }
});

function processMessage(obj) {
    if (obj && obj.command) {
        _D(`process Message ${_o(obj)}`);
        switch (obj.command) {
            case 'ping': 
                // Try to connect to mqtt broker
                if (obj.callback && obj.message) {
                    ping.probe(obj.message, {log: adapter.log.debug}, function (err, result) {
                        adapter.sendTo(obj.from, obj.command, res, obj.callback);
                    });
                }
                break;
            case 'send': 
                // e.g. send email or pushover or whatever
                adapter.log.info('KM200 send command from message');

                // Send response in callback if required
                if (obj.callback) 
                    adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
                
                break;
        }
    }
    adapter.getMessage(function (err, obj) {
        if (obj) {
            processMessage(obj);
        }
    });    
}

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', obj => processMessage(obj));

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', () => main());

function minutes(min) {
        const val = min*1000*60;
        const d = Math.floor(val /(1000*60.0*60*24));
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
    return pSeriesP(Object.keys(km200.scannedServices), n => {
        let o = km200.scannedServices[n];
        let t = o.type;
        let u = o.unitOfMeasure;
        let v = o.value;
        o.valIs = "value";
        if (v == -3276.8) // remove unused/unconnected values
            return Promise.resolve('');
        let w = !!o.writeable;
        let r =  w ? 'level' : 'value';
        let s = false;
        if (u === 'C') {
            u = '°C';
            r += '.temperature';
        } else if(typeof u === 'undefined)')
            u = "";
        switch(t) {
            case 'stringValue':
                if (Array.isArray(o.allowedValues)) {
                    o.valIs = 'states';
                    t = 'number';
                    v = o.allowedValues.indexOf(o.value);
                    s = [];
                    for(let ii =0; ii<o.allowedValues.length; ++ii) 
                        s.push(ii.toString() + ':'+ o.allowedValues[ii]);
                    s = s.join(';');
                }  else
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
        const c = {
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
        if (s) {
            c.common.states = s;
            c.common.min = 0;
            c.common.max = o.allowedValues.length-1;
        }
        if (typeof o.minValue !== 'undefined')
            c.common.min = o.minValue;
        if (typeof o.maxValue !== 'undefined')
            c.common.max = o.maxValue;
        c.native.km200 = o;
        states[n]=c;
        return c2pP(adapter.setObject)(n,c)
            .then(() =>  c2pP(adapter.setState)(_I(`Create State ${n} with ${_o(c)}`,n), { 
                val:v, 
                ack:true, 
                ts: Date.now(),
            }))
            .catch(err => _I(`problem create state ${n}.`,n));
    },10).then(() => {
        const st = Object.keys(states)
        _I(`KM200 finished creation of ${st.length} states: ${_o(st)}`);
         // subscribe to states only now, but after we managed to write the TODO:
        return Promise.resolve(adapter.subscribeStates('*'));
    });
}

function updateStates(items) {
    if (typeof items === 'string') {
        const ai = adapter.name + '.' + adapter.instance +'.';
        if (items.startsWith(ai))
            items = items.slice(ai.length,items.length);
        if (setDel[items]) {
            clearTimeout(setDel[items]);
            setDel[items] = null;
        }    
        const ni = {};
        ni[items]= states[items];
        if (!states[items]) 
            return _I(`Could not find state for ${items}`);
        else 
            _I(`Update ${_o(ni)}`);
        items = ni;
    } else 
        if(!items)
            items = states 

    pSeriesP(Object.keys(items), n => {
        const o = items[n];        
        const km = o.native.km200;
        return c2pP(km200.get)(km.id)
            .then(data => {
                let val = null;
                if (km.valIs==='states')
                    val = data.allowedValues.indexOf(data.value);
                else
                    val = data[km.valIs];
                if (km.unitOfMeasure=='mins')
                    val = minutes(parseInt(val));
                return c2pP(adapter.setState)(n, { 
                    val:val, 
                    ack:true, 
                    ts: Date.now(),
                }).then(() => _I(`Updated '${n}' = ${_o(val)}`));                    
            }).catch(err => _I(`Update State ${$n} err: ${_o(err)}`));
    },50);
}

var ain = '';
function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:

    if(parseInt(adapter.config.interval)<5)  
        adapter.config.interval = 5;
    adapter.config.port = parseInt(adapter.config.port);
    if (!adapter.config.adresse || adapter.config.adresse.length<2)
        return _W(`config KM200 Addresse not available or too short: ${adapter.config.adresse}`);
    
    adapter.config.accesskey = adapter.config.accesskey.trim().toLowerCase();
    if (!adapter.config.accesskey || !(/^[0-9a-f]{64}$/.test(adapter.config.accesskey)))
        return _W(`config KM200 AccessKey seems to be invalid (need to be a hex string of 64 characters): 
            ${_o(adapter.config.accesskey)}`);

    ain = adapter.name + '.' + adapter.instance + '.';

    _I(`${ain} address: http://${adapter.config.adresse}:${adapter.config.port}`);
    _I(`Interval=${adapter.config.interval}, Black/Push-list: ${adapter.config.blacklist}`);

    km200.init(adapter.config.adresse,adapter.config.port,adapter.config.accesskey);

    var blacklist = _J(adapter.config.blacklist);

    if (blacklist && Array.isArray(blacklist))
        km200.addBlocked(blacklist);
    else
        _W(`KM200: invalid black/whitelist will be ignored:'${adapter.config.blacklist}'
            need to be an Array with []`);

    km200.getServices()
        .then(obj => {
            if(!obj || Object.keys(obj).length === 0) {
                adapter.log.error(`Did not get any Services from KLM200!: ${_o(obj)}, will stop adapter.`);
//                adapter.stop();
//                process.exit();
                return Promise.rej('Did not get any Services from KLM200!')
            } 
            _I(`Services found: ${Object.keys(obj).length}`);
            return createStates();
        })
//        .then(() => wait(10000))
//        .then(() => updateStates())
        .then(res => c2pP(adapter.objects.getObjectList)({startkey: _D(ain), endkey: ain + '\u9999'})
        ).then(res => pSeriesP(res.rows, item => {  // clean all states which are not part of the list
            if (states[item.id.slice(ain.length)]) 
                return Promise.resolve();
            return c2pP(adapter.deleteState)(item.id)
                .then(x => _D(`Del State: ${item.id}`), err => null) ///TC
                .then(y => c2pP(adapter.delObject)(item.id))
                .then(x => _D(`Del Object: ${item.id}`), err => null) ///TC
            },10)
        ).then(() => mtimeout = setInterval(updateStates,adapter.config.interval*1000*60));

}

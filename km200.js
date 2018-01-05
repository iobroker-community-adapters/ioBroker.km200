/**
 *
 * Buderus KM200 Adapter
 * v 1.1.1 2017.10.03
 */
/*jshint -W030*/
//// jxshint node:true, esversion:6, strict:true, undef:true, unused:true
"use strict";
const MCrypt = require('mcrypt').MCrypt,
    utils = require(__dirname + '/lib/utils'), // Get common adapter utils
    adapter = utils.Adapter('km200'),
    //	assert = require('assert'),
    A = require('./myAdapter');
//const EventEmitter =  require('events').EventEmitter;

A.init(adapter, main); // associate adapter and main with MyAdapter

class KM200 {
    constructor() {
        this.crypt = null;
        this.aesKey = null; // buffer will be generated on init from accessKey
        this.options = null;
        this.scannedServices = null;
        this.blocked = [];
        this.pushed = [];
        this.basicServices = [
            "/dhwCircuits",
            "/gateway",
            "/heatingCircuits",
            "/heatSources",
            "/notifications",
            "/recordings",
            "/solarCircuits",
            "/system",
        ];
    }
    /*  
     *  initialize  KM200
     *  accessUrl = string  z.b. 192.168.1.xxx oder wie bei mir BuderusKM200.fritz.box
     *  accessPort = sollte 80 sein außer er ist über den Router umgebogen :), wenn leer oder 0 wird er auf 80 gesetzt
     *  accessKey = hex string like 'b742c3085bcaeac989353b7655c016dda46e567fe6e8a609e8ea796e20a78a33' which you got from https://ssl-account.com/km200.andreashahn.info/
     *  pollTime = in wie vielen Minuten werden 
     */
    init(accessUrl, accessKey) {
        if (!accessUrl || !accessKey)
            return A.W(`KM200.init argument error:init(${accessUrl},  ${accessKey}), no init done!`);
        this.aesKey = new Buffer(accessKey, 'hex');
        this.scannedServices = null;
        this.blocked = [];
        this.crypt = new MCrypt('rijndael-128', 'ecb');
        this.crypt.open(this.aesKey);
        this.options = {
            hostname: accessUrl,
            timeout: 10000,
            status: [200],
            encoding: 'utf8',
            port: 80,
            headers: {
                'agent': 'TeleHeater/2.2.3',
                'User-Agent': 'TeleHeater/2.2.3',
                'Accept': 'application/json',
            }
        };
        if (accessUrl.indexOf(':') > 1) {
            let au = A.trim(A.split(accessUrl, ':'));
            this.options.hostname = accessUrl = au[0];
            this.options.port = au[1];
        }
        A.D(`KM200 init(${accessUrl}, ${accessKey}) done!`);
    }


    addBlocked(list) {
        if (!list)
            return A.W('KM200.setBlocked no list provided as argument!');
        if (!Array.isArray(list))
            list = [list];
        //        for(let i=0; i<list.length;i++) {
        //            let li = list[i];
        for (let li of list) {
            let ispush = false;
            if (li.startsWith('+')) {
                li = li.slice(1, li.length);
                ispush = true;
            } else if (li.startsWith('-'))
                li = li.slice(1, li.length);
            if (!li.startsWith('^/')) {
                if (!li.startsWith('/')) {
                    if (!li.startsWith('^'))
                        li = '^/' + li;
                    else
                        li = '^/' + li.slice(1, li.length);
                } else
                    li = '^' + li;
            }
            if (!li.endsWith('$'))
                li += '$';
            const j = li.indexOf('*');
            if (j > 1 && li[j - 1] !== '.')
                li = li.slice(0, j) + '.' + li.slice(j, li.length);
            (ispush ? this.pushed : this.blocked).push(A.D(`add to ${ispush? 'pushed' : 'blocked'} ${li}`, new RegExp(li)));
        }
    }

    /*  
     *  Get data from KM200
     *  service = string of service like '/system' to access
     *  callback(err,data) with received data, either an array or an object
     *
     */
    get(service) {
        if (!service || service.length < 2 || service[0] !== '/')
            return Promise.reject(A.W(`KM200.get service parameter not as requested '${A.O(service)}'`));
        if (!this.crypt || !this.options)
            return Promise.reject(A.W(`KM200.get not initialized for decryption! Will not work ${A.O(service)}'`));
        const opt = A.url('http://'+this.options.hostname+service,this.options);
        opt.method = 'GET';
//        opt.url = opt.hostname + service;
        opt.status = [200, 403];
        return A.retry(2, () => A.request(opt)
            .then(data => {
                if (!data)
                    return Promise.reject(`No Data for ${service}!`);
                const b = new Buffer(data, 'base64');
                let o = null;
                try {
                    let s = b.toString('hex');
                    //                        A.D('fh'+s);
                    s = this.crypt.decrypt(b).toString('utf8');
                    while (s.charCodeAt(s.length - 1) === 0)
                        s = s.slice(0, s.length - 1);
                    o = A.J(s);
                } catch (e) {
                    return Promise.reject(`KM200 response Error  for ${service}, most probabloy Key not accepted :${A.O(e,3)}`);
                }
                if (o && o.references)
                    o = o.references;
                return o;
            }, err => err.indexOf('status 403/') > 0 ? Promise.resolve() : Promise.reject(err)));
        //        A.D(A.O(opt));
    }
    set(service, value) {

        const post = this.crypt.encrypt(JSON.stringify({
            value: value
        })).toString('base64');
        const opt = A.url('http://'+this.options.hostname+service,this.options);
        opt.headers["Content-Type"] = "application/json";
        opt.path = service;
        opt.method = 'POST';
        opt.status = [200, 204];
        return A.request(opt, post);
    }

    isBlocked(id) {
        for (let i = 0; i < this.pushed.length; ++i)
            if (this.pushed[i].test(id))
                return false;
        for (let i = 0; i < this.blocked.length; ++i)
            if (this.blocked[i].test(id))
                return true;
        return false;
    }

    getServices(service) {
        let level = false;
        if (!service) {
            service = this.basicServices;
            this.scannedServices = {};
            level = true;
        }
        if (!Array.isArray(service))
            return Promise.reject(A.I(`Invalid (not Array) getService for ${A.O(service)}`));
        A.D(`try to get services for ${A.O(service)}`);
        return A.seriesOf(service, item => {
            if (this.isBlocked(item))
                return Promise.resolve(null);
            return this.get(item)
                .then(data => {
                    //                    A.D(`get returned ${A.O(data)}`)
                    if (!data)
                        return null;
                    if (Array.isArray(data)) {
                        return A.seriesOf(data, di => {
                            //                            A.D(`array had ${A.O(di)}`)
                            if (di && di.id && di.uri && !this.isBlocked(di.id))
                                return this.getServices([di.id]);
                            return Promise.resolve();
                        }, 10);
                    } else {
                        if (!this.isBlocked(item)) {
                            if (data.setpointProperty)
                                return this.getServices(A.D(`setPointProperty = ${data.setpointProperty.id}`, [data.setpointProperty.id]));
                            if (data.recordedResource)
                                return this.getServices(A.D(`recordedResource = ${data.recordedResource.id}`, [data.recordedResource.id]));
                            const d = item.split('/').slice(1).join('.');
                            this.scannedServices[d] = data;
                            return Promise.resolve(A.D(`Service[${d}]=${A.O(data)}`, null));
                        }
                    }
                    return null;
                }).catch(err => A.D(`could not get data for '${item} with err=${err}`));
        }, 10).then(() => {
            if (!level) return Promise.resolve();
            const s = Object.keys(this.scannedServices);
            if (s.length === 0)
                return A.W(`Did not get any Services from KLM200!: ${A.O(this.scannedServices)}`);
            const ns = {};
            for (let i of s.sort())
                ns[i] = this.scannedServices[i];
            this.scannedServices = ns;
            return ns;
        });
    }
}
const km200 = new KM200();

var mtimeout = null;

var states = {};


// is called if a subscribed state changes
A.stateChange = function (id, state) {
    // Warning, state can be null if it was deleted
    //    adapter.log.info(adapter.instance + ' stateChange ' + id + ' ' + A.O(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    //        adapter.log.info(id+' stateChange to '+ A.O(state));
    let iid = id.split('.').slice(2);
    const serv = '/' + iid.join('/');
    iid = iid.join('.');
    //        adapter.log.info("km200.set "+serv+" = "+state.val);
    let val = state.val;
    iid = states[iid];
    if (iid && iid.common.states) { // convert states in ioBroker to allowed string values for KM200
        const sa = iid.common.states.split(';');
        val = sa[state.val].split(':')[1];
        //            adapter.log.info('Check Converted for '+iid+' State '+A.O(iid) + ' to ' + val);
    }

    return km200.set(serv, val)
        .then(() => {
            A.I(`Set ${id} to ${state.val}`);
            //                adapter.log.info('KM200.set '+serv + " changed to "+state.val);
            const ids = id.split('.').slice(2).join('.');
            const ite = {};
            ite[ids] = states[ids];
            //                adapter.log.info('Set KM200 returned: '+ A.O(ite));
            return true;
        }, err => A.W(`Set KM200 err: ${A.O(err)}`, err))
        .then(() => (A.wait(2000).then(() => updateStates(id)), true));
};

function minutes(min) {
    const val = min * 1000 * 60;
    const d = Math.floor(val / (1000 * 60.0 * 60 * 24));
    return (d > 0 ? d.toString() + "-" : "") + new Date(val).toUTCString().split(" ")[4].slice(0, 5);

}

function createStates() {
    states = {};
    // I got Types:{ floatValue: 89, stringValue: 36, switchProgram: 4, systeminfo: 3, errorList: 1, yRecording: 8, arrayData: 5 }
    //       Units:{ C: 34, undefined: 57, 'l/min': 1, mins: 7, '%': 12, kW: 13, 'µA': 2, Pascal: 2, kWh: 6, 'kg/l': 2, ' ': 6, 'l/h': 2, bar: 2 }
    // looks like: { id: 146,   type: 146,   writeable: 146,   recordable: 142,   value: 125,   unitOfMeasure: 89,   
    //      allowedValues: 27,   setpointProperty: 4,   maxNbOfSwitchPoints: 4,   maxNbOfSwitchPointsPerDay: 4,   switchPointTimeRaster: 4,   
    //      switchPoints: 4,   minValue: 12,   maxValue: 12,   values: 9,   recordedResource: 8,   interval: 8,   sampleRate: 8,   
    //      'recording-type': 8,   recording: 8 }
    return A.seriesIn(km200.scannedServices, n => {
        let o = km200.scannedServices[n];
        let t = o.type;
        let u = o.unitOfMeasure;
        let v = o.value;
        o.valIs = "value";
        if (v === -3276.8) // remove unused/unconnected values
            return Promise.resolve('');
        let w = !!o.writeable;
        let r = w ? 'level' : 'value';
        let s = false;
        if (u === 'C') {
            u = '°C';
            r += '.temperature';
        } else if (typeof u === 'undefined')
            u = "";
        switch (t) {
            case 'stringValue':
                if (Array.isArray(o.allowedValues)) {
                    o.valIs = 'states';
                    t = 'number';
                    v = o.allowedValues.indexOf(o.value);
                    s = [];
                    for (let ii = 0; ii < o.allowedValues.length; ++ii)
                        s.push(ii.toString() + ':' + o.allowedValues[ii]);
                    s = s.join(';');
                } else
                    t = 'string';
                break;
            case 'floatValue':
                t = 'number';
                break;
            case 'systeminfo':
            case 'errorList':
            case 'arrayData':
                v = A.O(o.values);
                o.valIs = "values";
                t = 'string';
                w = false;
                break;
            case 'switchProgram':
                v = o.switchPoints;
                o.valIs = "switchPoints";
                t = 'array';
                w = false;
                break;
            default: // don't process others'
                return Promise.resolve(null);
        }
        if (u === 'mins') {
            t = 'string';
            v = minutes(parseInt(v));
        }
        const c = {
            type: 'state',
            id: n,
            common: {
                id: n,
                name: n,
                type: t,
                unit: u,
                read: true,
                write: w,
                role: r,
            },
            native: {}
        };
        if (s) {
            c.common.states = s;
            c.common.min = 0;
            c.common.max = o.allowedValues.length - 1;
        }
        if (typeof o.minValue !== 'undefined')
            c.common.min = o.minValue;
        if (typeof o.maxValue !== 'undefined')
            c.common.max = o.maxValue;
        c.native.km200 = o;
        c.common.native = {km200: o};
        states[n] = c;
        return A.makeState(c.common, v, true);
    }, 10).then(() => {
        const st = Object.keys(states);
        A.I(`KM200 finished creation of ${st.length} states: ${A.O(st)}`);
        // subscribe to states only now, but after we managed to write the TODO:
        return Promise.resolve(adapter.subscribeStates('*'));
    });
}

function updateStates(items) {
    if (typeof items === 'string') {
        const ai = adapter.name + '.' + adapter.instance + '.';
        if (items.startsWith(ai))
            items = items.slice(ai.length, items.length);
        const ni = {};
        ni[items] = states[items];
        if (!states[items])
            return A.I(`Could not find state for ${items}`);
        else
            A.I(`Update ${A.O(ni)}`);
        items = ni;
    } else
    if (!items)
        items = states;

    A.seriesIn(items, n => {
        const o = items[n];
        const km = o.native.km200;
        return km200.get(km.id)
            .then(data => {
                let val = null;
                if (km.valIs === 'states')
                    val = data.allowedValues.indexOf(data.value);
                else
                    val = data[km.valIs];
                if (km.unitOfMeasure === 'mins')
                    val = minutes(parseInt(val));
                return A.makeState(n, val, true);
            }).catch(err => A.I(`Update State ${n} err: ${A.O(err)}`));
    }, 5);
}

var ain = '';

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:

    if (parseInt(adapter.config.interval) < 5)
        adapter.config.interval = 5;
    if ((A.debug = adapter.config.adresse.startsWith('debug!')))
        adapter.config.adresse = adapter.config.adresse.slice(A.D(`Debug mode on!`, 6)).trim();

    if (!adapter.config.adresse || adapter.config.adresse.length < 2)
        return A.W(`config KM200 Addresse not available or too short: ${adapter.config.adresse}`);

    adapter.config.accesskey = adapter.config.accesskey.trim().toLowerCase();
    if (!adapter.config.accesskey || !(/^[0-9a-f]{64}$/.test(adapter.config.accesskey)))
        return A.W(`config KM200 AccessKey seems to be invalid (need to be a hex string of 64 characters): 
            ${A.O(adapter.config.accesskey)}`);

    ain = adapter.name + '.' + adapter.instance + '.';

    A.I(`${ain} address: http://${adapter.config.adresse}`);
    km200.init(adapter.config.adresse, adapter.config.accesskey);

    //    var blacklist = A.J(adapter.config.blacklist);
    let blacklist = A.trim(A.split(adapter.config.blacklist.replace(/\"|\[|\]/g, ' '), ','));
    if (blacklist && Array.isArray(blacklist))
        km200.addBlocked(blacklist);
    else
        A.W(`KM200: invalid black/whitelist will be ignored:'${adapter.config.blacklist}'
            need to be an Array with []`);

    A.I(`Interval=${adapter.config.interval} min, Black/Push-list: ${blacklist}`);


    km200.getServices()
        .then(obj => {
            if (!obj || Object.keys(obj).length === 0) {
                adapter.log.error(`Did not get any Services from KLM200!: ${A.O(obj)}, will stop adapter.`);
                //                adapter.stop();
                //                process.exit();
                return Promise.reject('Did not get any Services from KLM200!');
            }
            A.I(`Services found: ${Object.keys(obj).length}`);
            return createStates();
        })
        .then(() => A.getObjectList({
            startkey: ain,
            endkey: ain + '\u9999'
        })).then(res => A.seriesOf(res.rows, item => { // clean all states which are not part of the list
            if (states[item.id.slice(ain.length)])
                return Promise.resolve();
            return A.deleteState(item.id)
                .then(() => A.D(`Del State: ${item.id}`), () => null) ///TC
                .then(() => A.delObject(item.id))
                .then(() => A.D(`Del Object: ${item.id}`), () => null) ///TC
                .catch(() => null);
        }, 10)).then(() => A.timer = mtimeout = setInterval(updateStates, adapter.config.interval * 1000 * 60));

}

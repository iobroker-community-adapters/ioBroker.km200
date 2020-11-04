/**
 *
 * Buderus KM200 Adapter
 * v 2.03 2020
 */
/*jshint -W030*/
//// jxshint node:true, esversion:6, strict:true, undef:true, unused:true
"use strict";
const crypto = require('crypto'),
    mcrypt = require('js-rijndael'),
    A = require('@frankjoke/myadapter').MyAdapter;

const km200_crypt_md5_salt = new Uint8Array([
    0x86, 0x78, 0x45, 0xe9, 0x7c, 0x4e, 0x29, 0xdc,
    0xe5, 0x22, 0xb9, 0xa7, 0xd3, 0xa3, 0xe0, 0x7b,
    0x15, 0x2b, 0xff, 0xad, 0xdd, 0xbe, 0xd7, 0xf5,
    0xff, 0xd8, 0x42, 0xe9, 0x89, 0x5a, 0xd1, 0xe4
]);

function isInList(id, list) {
    for (let i of list)
        if (i.test(id))
            return id;
    return false;
}

function makeRegexp(li) {
    if (!li.startsWith('^/')) {
        if (!li.startsWith('/')) {
            if (!li.startsWith('^'))
                li = li.startsWith('*') ? '.' + li : '.*' + li;
            else
                li = '^/' + li.slice(1);
        } else
            li = '^' + li;
    }
    if (!li.endsWith('$'))
        li += '$';

    return new RegExp(li.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\\\.\.\*/g, '.*'));
}

class KM200 {
    constructor() {
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
            "/system"
        ];
        this.recNames = ['_Hours', '_Days', '_Months', '_2daysBefore', '_Today', '_Yesterday', '_2monthBefore', '_ThisMonth', '_LastMonth', '_2yearsBefore', '_ThisYear', '_LastYear'];
    }


    /*  
     *  initialize  KM200
     *  accessUrl = string  z.b. 192.168.1.xxx oder wie bei mir BuderusKM200.fritz.box
     *  gwpw = Gatewa Passwort
     *  prpw = Private Passwort which you use also on the mobile app or web
     */
    init(accessUrl, gwpw, prpw) {
        function getAccesskey(gatewaypassword, privatepassword) {
            function md5(text) {
                return crypto.createHash('md5').update(text).digest("hex");
            }

            function str2ab(str) {
                let buf = new ArrayBuffer(str.length * 1); // 2 bytes for each char
                let bufView = new Uint8Array(buf);
                for (let i = 0, strLen = str.length; i < strLen; i++) {
                    bufView[i] = str.charCodeAt(i);
                }
                return bufView;
            }

            //            function ab2str(buf) {
            //                return String.fromCharCode.apply(null, new Uint8Array(buf));
            //            }

            function concatUint8Array(array1, array2) {
                const array3 = new Uint8Array(array1.length + array2.length);
                for (let i = 0; i < array1.length; i++) {
                    array3[i] = array1[i];
                }
                for (let i = 0; i < array2.length; i++) {
                    array3[array1.length + i] = array2[i];
                }
                return array3;
            }

            gatewaypassword = gatewaypassword.replace(/-/g, '');
            let km200_gateway_password = str2ab(gatewaypassword);
            let km200_private_password = str2ab(privatepassword);
            // Erste Hälfte des Schlüssels: MD5 von ( Gerätepasswort . Salt )
            let key_1 = md5(concatUint8Array(km200_gateway_password, km200_crypt_md5_salt));
            // Zweite Hälfte des Schlüssels - initial: MD5 von ( Salt )
            //            let key_2_initial = md5(km200_crypt_md5_salt);
            // Zweite Hälfte des Schlüssels - privat: MD5 von ( Salt . privates Passwort )
            let key_2_private = md5(concatUint8Array(km200_crypt_md5_salt, km200_private_password));
            //            let km200_crypt_key_initial = key_1 + key_2_initial;
            let km200_crypt_key_private = key_1 + key_2_private;
            return km200_crypt_key_private.trim().toLowerCase();
        }


        if (!accessUrl || !gwpw)
            return A.W(`KM200.init argument error:init(${accessUrl},  GW:${gwpw}, PW:${prpw}), no init done!`);
        this.aesKey = (/^[0-9a-f]{64}$/.test(gwpw)) ? gwpw : getAccesskey(gwpw, prpw);
        this.aesKey = Buffer.from(this.aesKey, 'hex');
        this.aesKey = Array.from(this.aesKey);
        this.scannedServices = null;
        this.blocked = [];
        this.options = {
            hostname: accessUrl,
            timeout: 5000,
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
        A.D(`KM200 init(${accessUrl}, ${this.aesKey.toString('hex')}) done!`);
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
                li = li.slice(1);
                ispush = true;
            } else if (li.startsWith('-'))
                li = li.slice(1);
            li = makeRegexp(li);
            (ispush ? this.pushed : this.blocked).push(A.D(`add to ${ispush ? 'pushed' : 'blocked'} ${li}`, li));
        }
    }

    /*  
     *  Get data from KM200
     *  service = string of service like '/system' to access
     *  callback(err,data) with received data, either an array or an object
     *
     */
    get(service) {
        const self = this;


        function get2(ns, n, s1, s2, s3) {
            s1 = ns.concat(s1).join('/');
            s2 = ns.concat(s2).join('/');
            s3 = s3 ? ns.concat(s3).join('/') : null;
            n = ns.concat(n).join('/');
            return self.get(s1).then(x => s1 = x, () => s1 = {
                values: []
            }).then(() => self.get(s2)).then(x => s2 = x, () => s2 = {
                values: []
            }).then(() => s3 ? self.get(s3) : {
                values: []
            }).then(x => s3 = x, () => s3 = {
                values: []
            }).then(() => {
                ns = s1 && s1.values ? s1.values : [];
                s1 = s1 && s1.id ? s1 : s2;
                s1.id = n;
                ns = ns.concat(s2.values, s3.values);
                while (ns.length > 0 && isNaN(ns[0]))
                    ns.shift();
                while (ns.length > 0 && isNaN(ns[ns.length - 1]))
                    ns.pop();
                s1.values = ns;
                return s1;
            });
        }
        if (!service || service.length < 2 || service[0] !== '/')
            return A.reject(A.W(`KM200.get service parameter not as requested '${A.O(service)}'`));
        const oservice = service;
        const lasts = service.split('/').slice(-1)[0];
        let ns;
        if (service.startsWith('/recordings/') && this.recNames.indexOf(lasts) >= 0) {
            const date = new Date();
            ns = service.split('/').slice(0, -1);
            let nsn = ns[ns.length - 1]; // keep last to expand
            nsn += '?interval=';
            switch (lasts) {
                case '_Hours':
                    return get2(ns, lasts, '_2daysBefore', '_Yesterday', '_Today');
                case '_Days':
                    return get2(ns, lasts, '_2monthBefore', '_LastMonth', '_ThisMonth', lasts);
                case '_Months':
                    return get2(ns, lasts, '_2yearsBefore', '_LastYear', '_ThisYear');
                case '_Today':
                    nsn += A.dateTime(date).slice(0, 10);
                    break;
                case '_Yesterday':
                    date.setDate(date.getDate() - 1);
                    nsn += A.dateTime(date).slice(0, 10);
                    break;
                case '_2daysBefore':
                    date.setDate(date.getDate() - 2);
                    nsn += A.dateTime(date).slice(0, 10);
                    break;
                case '_ThisMonth':
                    nsn += A.dateTime(date).slice(0, 7);
                    break;
                case '_LastMonth':
                    date.setDate(1);
                    date.setMonth(date.getMonth() - 1);
                    nsn += A.dateTime(date).slice(0, 7);
                    break;
                case '_2monthBefore':
                    date.setDate(1);
                    date.setMonth(date.getMonth() - 2);
                    nsn += A.dateTime(date).slice(0, 7);
                    break;
                case '_ThisYear':
                    nsn += A.dateTime(date).slice(0, 4);
                    break;
                case '_2yearsBefore':
                    date.setDate(1);
                    date.setMonth(1);
                    date.setFullYear(date.getFullYear() - 2);
                    nsn += A.dateTime(date).slice(0, 4);
                    break;
                case '_LastYear':
                    date.setDate(1);
                    date.setMonth(1);
                    date.setFullYear(date.getFullYear() - 1);
                    nsn += A.dateTime(date).slice(0, 4);
                    break;
                default:
                    break; // should never happen
            }
            //            A.If('Get recordings from service %s for %s', service, nsn, date);
            ns[ns.length - 1] = nsn;
            service = ns.join('/');
            //            A.If('Get recordings from service %s', service, ns);
        }
        const opt = A.url('http://' + this.options.hostname + service, this.options);
        opt.method = 'GET';
        //        opt.url = opt.hostname + service;
        opt.status = [200, 403];

        return A.retry(4, () => A.request(opt)
                .then((data) => {
                    if (!data)
                        return Promise.reject(`No Data for ${service}!`);
                    const b = new Buffer(data, 'base64');
                    let o = null;
                    try {
                        let s = Array.from(b);
                        s = mcrypt.decrypt(s, null, this.aesKey, 'rijndael-128', 'ecb');
                        s = Buffer.from(s).toString('utf8');
                        o = A.J(s);
                    } catch (e) {
                        return A.reject(`KM200 response Error  for ${service}, most probabloy Key not accepted :${A.O(e, 3)}`);
                    }
                    if (o.type === 'yRecording' && o.recording && o.recording.length > 0) {
                        o.type = 'arrayData';
                        //                        A.If('item %s should get %s', o.id, o.recordedResource.id.endsWith('Power'));
                        o.values = o.recording.map(x => x.c ? Math.round((1000.0 * x.y) / (o.recordedResource.id.endsWith('Power') ? 60.0 : x.c)) / 1000.0 : NaN);
                        delete o.recordedResource;
                        delete o.recording;
                        o.id = oservice;
                        //                    A.Df('get recordings for service %s was %O', service, o);
                        return A.resolve(o);
                    }
                    if (o && o.references)
                        o = o.references;
                    //                    A.If('Service:%s was %O',service,o);
                    return A.resolve(o);
                }), opt.pathname, 30)
            .catch(() => A.Wf('Skip service data of %s', opt.pathname));
        //        A.D(A.O(opt));
    }

    set(service, value) {
        let post = JSON.stringify({
            value: value
        });
        post = Array.from(Buffer.from(post, 'utf8'));
        post = mcrypt.encrypt(post, null, this.aesKey, 'rijndael-128', 'ecb');
        post = Buffer.from(post);
        post = post.toString('base64');
        const opt = A.url('http://' + this.options.hostname + service, this.options);
        opt.headers["Content-Type"] = "application/json";
        opt.path = service;
        opt.method = 'POST';
        opt.status = [200, 204];
        return A.request(opt, post);
    }

    isBlocked(id) {
        if (isInList(id, this.pushed))
            return false;
        return isInList(id, this.blocked);
    }

    getServices(service) {
        const self = this;
        let level = false;
        if (!service) {
            service = this.basicServices;
            this.scannedServices = {};
            level = true;
        }
        if (!Array.isArray(service))
            return A.reject(A.I(`Invalid (not Array) getService for ${A.O(service)}`));
        //        A.D(`try to get services for ${A.O(service)}`);
        return A.seriesOf(service, (item) => {
            //            if (self.isBlocked(item))
            //                return Promise.resolve(null);
            return self.get(item)
                .then((data) => {
                    //                    A.D(`get returned ${A.O(data)}`)
                    if (!data)
                        return null;
                    if (Array.isArray(data)) {
                        return A.seriesOf(data, (di) => {
                            //                            A.D(`array had ${A.O(di)}`)
                            if (di && di.id && di.uri /* && !self.isBlocked(di.id) */ )
                                return self.getServices([di.id]);
                            return A.resolve();
                        }, 10);
                    } else if (data.recordedResource)
                        return self.getServices(self.recNames.slice(0, 3).map(i => item + '/' + i));
                    else if (!self.isBlocked(item)) {
                        return A.resolve().then(() => data.setpointProperty ? self.getServices(A.D(`setPointProperty = ${data.setpointProperty.id}`, [data.setpointProperty.id])) : null)
                            //                            .then(() => data.recordedResource ? self.getServices(A.D(`recordedResource = ${data.recordedResource.id}`, [data.recordedResource.id])) : null)
                            .then(() => {
                                const d = item.split('/').slice(1).join('.');
                                self.scannedServices[d] = data;
                                return Promise.resolve(A.D(`Service[${d}]=${A.O(data)}`, null));
                            }).catch(e => A.Wf('Error in getservice: %O', e));
                    }
                    return null;
                }).catch((err) => A.D(`could not get data for '${item} with err=${err}`));
        }, 20).then(() => {
            if (!level) return A.resolve();
            const s = Object.keys(this.scannedServices);
            if (s.length === 0)
                return A.W(`Did not get any Services from KLM200!: ${A.O(self.scannedServices)}`);
            const ns = {};
            for (let i of s.sort())
                ns[i] = self.scannedServices[i];
            self.scannedServices = ns;
            return ns;
        });
    }
}

A.init(module, 'km200', main); // associate adapter and main with MyAdapter


const km200 = new KM200();

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
        }, (err) => A.W(`Set KM200 err: ${A.O(err)}`, err))
        .then(() => (A.wait(2000).then(() => updateStates(id)), true));
};
/*
function minutes(min) {
    const val = min * 1000 * 60;
    const d = Math.floor(val / (1000 * 60.0 * 60 * 24));
    return (d > 0 ? d.toString() + "-" : "") + new Date(val).toUTCString().split(" ")[4].slice(0, 5);

}
*/
function createStates() {
    states = {};
    // I got Types:{ floatValue: 89, stringValue: 36, switchProgram: 4, systeminfo: 3, errorList: 1, yRecording: 8, arrayData: 5 }
    //       Units:{ C: 34, undefined: 57, 'l/min': 1, mins: 7, '%': 12, kW: 13, 'µA': 2, Pascal: 2, kWh: 6, 'kg/l': 2, ' ': 6, 'l/h': 2, bar: 2 }
    // looks like: { id: 146,   type: 146,   writeable: 146,   recordable: 142,   value: 125,   unitOfMeasure: 89,   
    //      allowedValues: 27,   setpointProperty: 4,   maxNbOfSwitchPoints: 4,   maxNbOfSwitchPointsPerDay: 4,   switchPointTimeRaster: 4,   
    //      switchPoints: 4,   minValue: 12,   maxValue: 12,   values: 9,   recordedResource: 8,   interval: 8,   sampleRate: 8,   
    //      'recording-type': 8,   recording: 8 }
    return A.seriesIn(km200.scannedServices, (n) => {
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
                v = A.O(o.switchPoints);
                o.valIs = "switchPoints";
                t = 'string';
                //                w = false;
                break;
            case 'yRecording':
                v = o.values;
                o.valIs = "values";
                t = 'array';
                w = false;
                break;
            default: // put others in pure objects'
                v = A.O(o, 4);
                o.valIs = "values";
                t = 'string';
                w = false;
                //                return Promise.resolve(null);
        }
        /*
                if (u === 'mins') {
                    t = 'string';
                    v = minutes(parseInt(v));
                }
        */
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
        c.common.native = {
            km200: o
        };
        states[n] = c;
        return A.makeState(c.common, v, true);
    }, 10).then(() => {
        const st = Object.keys(states);
        A.I(`KM200 found ${st.length} states, get their values now.`);
        // subscribe to states only now, but after we managed to write the TODO:
        return Promise.resolve(A.adapter.subscribeStates('*'));
    });
}

function updateStates(items) {
    A.Df('updateStates: %O @%s', !items ? 'all' : items, new Date());
    if (typeof items === 'string') {
        if (items.startsWith(A.ain))
            items = items.slice(A.ain.length, items.length);
        const ni = {};
        ni[items] = states[items];
        if (!states[items])
            return A.I(`Could not find state for ${items}`);
        else
            A.I(`Update ${A.O(ni)}`);
        items = ni;
    } else if (!items) items = states;
    if (Array.isArray(items))
        items = items.map(i => states[i]);
    return A.seriesIn(items, (n) => {
            const o = items[n];
            const km = o.native.km200;
            return km200.get(km.id)
                .then((data) => {
                    let val = null;
                    if (km.valIs === 'states')
                        val = data.allowedValues.indexOf(data.value);
                    else
                        val = data[km.valIs];
                    //                if (km.unitOfMeasure === 'mins')
                    //                    val = minutes(parseInt(val));
                    return A.makeState(o.id, val, true);
                }).catch((err) => A.I(`Update State ${n} err: ${A.O(err)}`));
        }, 5)
        .catch(e => A.Wf('Error in updateStates: %O', e));
}


function main() {
    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // A.C:

    A.C.interval = (isNaN(Number(A.C.interval))) ? 30 : Number(A.C.interval);
    A.C.fastinterval = (isNaN(Number(A.C.fastinterval))) ? 10 : Number(A.C.fastinterval);
    A.C.slowinterval = (isNaN(Number(A.C.slowinterval))) ? 12 : Number(A.C.slowinterval);

    if ((A.debug = A.C.adresse.startsWith('debug!')))
        A.C.adresse = A.C.adresse.slice(A.D(`Debug mode on!`, 6)).trim();

    if (!A.C.adresse || A.C.adresse.length < 2)
        return A.W(`config KM200 Addresse not available or too short: ${A.C.adresse}`);
    if (A.C.adresse.endsWith('!')) {
        A.C.adresse = A.C.adresse.slice(0, -1);
        A.debug = true;
    }


    if (!A.C.accesskey)
        return A.W(`Gateway or access missing!`);

    A.I(`${A.ains} address: http://${A.C.adresse}`);

    A.C.privatepassword = A.C.privatepassword ? A.C.privatepassword.trim() : '';
    km200.init(A.C.adresse, A.C.accesskey.trim(), A.C.privatepassword);

    let seq = new A.Sequence();

    //    var blacklist = A.J(A.C.blacklist);
    let blacklist = A.trim(A.split(A.C.blacklist.replace(/"|\[|\]/g, ' '), ',')).filter(x => !!x);
    if (blacklist && Array.isArray(blacklist) && (blacklist.length > 1 || blacklist[0] !== ''))
        km200.addBlocked(blacklist);
    else
        A.I(`KM200: no blacklist used.`);

    let fastlist = A.trim(A.split(A.C.fastlist.replace(/"|\[|\]/g, ' '), ',')).map(i => makeRegexp(i));
    if (!fastlist) fastlist = [];

    let slowlist = A.trim(A.split(A.C.slowlist.replace(/"|\[|\]/g, ' '), ',')).map(i => makeRegexp(i));
    if (!slowlist) slowlist = [];

    let slowa = [];
    let fasta = [];
    let norma = [];

    //    A.I(`Interval=${A.C.interval} min, Black/Push-list: ${blacklist}`);
    //    A.I(`Fast Interval=${fastint} min, Fast-List: ${fastlist}`);
    //    A.I(`Slow Interval=${slowint} hours, Slow-List: ${slowlist}`);
    A.clearStates();
    km200.getServices()
        .then((obj) => {
            if (!obj || Object.keys(obj).length === 0) {
                A.E(`Did not get any Services from KLM200!: ${A.O(obj)}, will stop adapter.`);
                //                adapter.stop();
                //                process.exit();
                return Promise.reject('Did not get any Services from KLM200!');
            }
            A.I(`Services found: ${Object.keys(obj).length}`);
            return createStates();
        })
        .catch(e => A.Wf('INit getservices error %O', e))
        .then(() => {
            for (let s of A.ownKeys(states)) {
                if (isInList(s, fastlist))
                    fasta.push(s);
                else if (isInList(s, slowlist))
                    slowa.push(s);
                else
                    norma.push(s);
            }
            A.I(`Interval=${A.C.interval} min, Norm-list: ${norma}\n`);
            A.I(`Fast Interval=${A.C.fastinterval} min, Fast-List: ${fasta}\n`);
            A.I(`Slow Interval=${A.C.slowinterval} hours, Slow-List: ${slowa}\n`);
        })
        .then(() => updateStates())
        .then(() => {
            A.timer = [];
            let f = seq.addp.bind(seq);
            if (norma.length)
                A.timer.push(setInterval(f, A.C.interval * 1000 * 60, () => updateStates(norma)));
            if (fasta.length && A.C.fastinterval)
                A.timer.push(setInterval(f, A.C.fastinterval * 1000 * 60, () => updateStates(fasta)));
            if (slowa.length && A.C.slowinterval)
                A.timer.push(setInterval(f, A.C.slowinterval * 1000 * 60 * 60, () => updateStates(slowa)));
        })
        .then(() => A.C.deletestates ? A.cleanup('*') : null)
        .then(A.nop, A.nop)
        .then(() => A.If('Adapter km200 initialization finished with %d states.', A.ownKeys(states).length));

}
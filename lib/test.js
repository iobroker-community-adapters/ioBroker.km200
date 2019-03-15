"use strict";

// const net = require('net');
// const dns = require('dns');

const A = require('../myAdapter').MyAdapter,
//    MCrypt = require('mcrypt').MCrypt,
    mcrypt = require('js-rijndael');

/*
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
        process.exit();
    } else {
        A.If(`You pressed the "${str}" key:%O`, key);
        if (key.name === 'q')
            bl.close();
            process.exit();

    }
});

*/
A.debug = true;

async function wait(x, arg) {
    await A.wait(x ? x : 2000);
    return arg;
}

const passkey = "b742c3085bcaeac999353b7655c016dda46e567ff6e8a609e8ea796e20a78a33";

let // field = "/dhwCircuits/dhw1/switchPrograms/A",
    server = "http://BuderusKM200.fritz.box";

function get(feldname) {
    return new Promise((res, rej) => {
        var url1 = server + feldname;
        var request = require('request');
//        A.If(url1);
        const options = {
            url: url1,
            method: 'GET',
            timeout: 4000,
            headers: {
                Accept: "application/json",
                agent: 'TeleHeater/2.2.3',
                'User-Agent': "TeleHeater/2.2.3"
            }
        };
        request(options, (error, response, body) => !error && response.statusCode == 200 ? res(Daten(body)) : rej(A.Wf('*** http Fehler on %s: %O',feldname, error)));
    });
    //********************************************************
    function Daten(body) {
        const key = Array.from(aesKey);

        function ecbDecrypt(buf) {
            buf = Buffer.from(buf, 'base64');
            buf = Array.from(buf);
            buf = mcrypt.decrypt(buf, null, key, 'rijndael-128', 'ecb');
            buf = Buffer.from(buf).toString('utf8');
            return buf;
        }

        var s = ecbDecrypt(body);
        while (s.charCodeAt(s.length - 1) === 0)
            s = s.slice(0, s.length - 1);

        var info = JSON.parse(s);

//        A.If('Daten von %s%s was %O:', server, feldname, info);
        let r;
        if (info && info.recording)
            r = info.recording;

        r = r ? r.map(x => x.c ? Math.round((1000.0 * x.y) / x.c) / 1000.0 : NaN) : [];

        A.If('Daten von %s was %O:', feldname, r);
    /*
        switch (info.type) {
            case "switchProgram":
                {
                    const json = JSON.stringify(info.switchPoints);
                    A.If('switchprogram retrurned %O', json);
                    break;
                }
        }
*/
    }
}
//const t = new A.Hrtime();

//const tests = 'Dies ist mein Teststring!asdasdasddasasdasdw';
let aesKey = Buffer.from(passkey, 'hex');
//let crypt = new MCrypt('rijndael-128', 'ecb');

//crypt.open(aesKey);

main().catch(e => A.Wf('main error was %O', e));

async function main() {
    /*    
        A.If('staring main %s, %s',t.text,A.O(crypt));
        await wait(100);
        A.If('mcrypt lista %s = %O',t.text,mcrypt.listAlgorithms());
        A.If('mcrypt listm %s = %O',t.text,mcrypt.listModes());
        await wait(100);
        const post = crypt.encrypt(tests).toString('base64');
        A.If('MCrypt post %s = %O',t.text,post);
        const b = new Buffer(post, 'base64');
        A.If('MCrypt b %s = %O',t.text,b);
        let s = crypt.decrypt(b).toString('utf8');
        while (s.charCodeAt(s.length - 1) === 0)
            s = s.slice(0, s.length - 1);
            A.If('MCrypt s %s = %O',t.text,s);
        A.If('after Discover, get all values, %s',t.text);

        let key = Array.from(aesKey);
        A.If('mrypt key %s = %O',t.text,key);
        let text = Array.from(new Buffer(tests,'utf8'));
        A.If('mrypt text %s = %O',t.text,text);
        let ecb = mcrypt.encrypt(text, null, key, 'rijndael-128', 'ecb');
        A.If('mrypt ecb %s = %O',t.text,ecb);
        let mb = Buffer.from(ecb);
        let ms = mb.toString('base64');
        A.If('mrypt ms %s = %O',t.text,ms);
        A.If('mrypt mb %s = %O',t.text,mb);
        let eta = mcrypt.decrypt(ecb, null, key, 'rijndael-128', 'ecb');
        A.If('mrypt eta %s = %O',t.text,eta);
        let ets = Buffer.from(eta).toString('utf8');
        A.If('mrypt ets %s = %O',t.text,ets);
    */
    await wait(100);

    //    get(field);
    await get('/recordings/heatingCircuits/hc2/roomtemperature?interval=2018');
    await get('/recordings/heatingCircuits/hc2/roomtemperature?interval=2019');
    await get('/recordings/heatingCircuits/hc2/roomtemperature?interval=2019-02');
    await get('/recordings/heatingCircuits/hc2/roomtemperature?interval=2019-03');
    await get('/recordings/heatingCircuits/hc2/roomtemperature?interval=2019-03-13');
    await get('/recordings/heatingCircuits/hc2/roomtemperature?interval=2019-03-14');
    await get('/notifications');
    //    bl.close();
}
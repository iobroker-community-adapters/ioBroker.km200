/**
 *
 * EZcontrol XS1 Adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var request =       require('request');
var async =         require('async');
var util =          require('util');
var http =          require('http');

var EventEmitter =  require('events').EventEmitter;

function objToString(obj,level) {    return  util.inspect(obj, false, level || 2, false).replace(/\n/g,' ');}

function safeJson(str) { try { return JSON.parse(str); } catch (e) { return {'error':'JSON Parse Error of:'+str}}} 


function MyXS1() {


    if (!(this instanceof MyXS1)) return new MyXS1();
    EventEmitter.call(this);

    this.url = null;
    this.names = {};
    this.creq = null;
    this.resp = null;
    this.connected = false;

    var that = this;
    
    var roles = {    
        "switch":               ["switch","timerswitch","sound","remotecontrol"],
        "sensor":               ["door","dooropen","motion","waterdetector","window"],
        "value.temperature":    ["temperature","number"],
        "value.brightness":     ["light"],
        "value.humidity":       ["hygrometer"],
        "value":                ["counter","rainintensity"],
        "direction":            ["winddirection"],
        "value.speed":          ["windspeed"],
        "level.blind":          ["shutter"],
    };


    var types = { "boolean": ["switch", "sensor"] };

    function findItem(l,i) {
        for(var s in l)
            if (l[s].indexOf(i)>=0)
                return s;
        return null;
    }

    that.getRole = function(vtype) {
        return findItem(roles,vtype);
    }

    that.getType = function(vtype) {
        var role = findItem(roles,vtype);
        var type = 'number';
        if (role) {
            var typ = findItem(types,role);
            if (typ) 
                type = typ;
        }
        return type;
    }


    that.disconnect = function(callback) {
        if(!that.connected) {
            that.emit("error","XS1 disconnect called on not connected device!");
            return;
        }
        if (that.creq)
            that.creq.abort();
        that.connected = false;
        that.resp = null;
        that.creq = null;
        that.emit('disconnected');
    };

    that.connect = function(callback,msg) {
        var url = that.url + "control?callback=cb&cmd=subscribe&format=txt&x="+Date.now();
        if (that.connected) {
            that.emit("error","XS1 connect called on already connected device!");
            return callback && callback("XS1 already connected");
        }
        try {
            that.creq = http.get(url,function(response) {
                that.resp = response;
                if (response.statusCode!=200) {
                    that.emit('error',response.statusCode);
                    return callback && callback("Bad status code for connection:"+response.statusCode,msg);
                }
                response.setEncoding('utf8');
                
    //            that.emit('msg','response',response.statusCode);
                
                response.on('data',function(buf) {
                    var b = buf.trim().split(' ');
                    if (b.length<14) 
                        return that.emit("error", {err:"Invalid response from XS1 data",value:buf},"warn");
                    var data = {};
                    var st = {'A':"Actuators",'S':"Sensors"};
                    try {
                        data.ts = parseInt(b[0]) * 1000;
                        data.lname = st[b[9]];
                        data.number = b[10];
                        data.name = b[11];
                        data.vtype = b[12];
                        data.val = parseFloat(b[13]);
                        if (myXS1.getType(data.vtype)==="boolean")
                            data.val = (data.val === 0 || data.val === false) ? false : !!data.val ;
                    } catch(e) {
                        return that.emit("error", {err:"Cannot read response from XS1 data",value:buf,arrcode:e},"warn");
                    }
                    that.emit('data',data); 
                });    
                response.on('error',function(err) {
                    that.emit('error',err,'error resp in XS1');
    //                that.emit('msg','error resp',err); 
                });    
                response.on('end',function() {
                    that.creq = null;
                    that.resp = null;
                    that.connected = false;
                    that.emit('disconnected'); 
                });    
                that.connected = true;
                that.emit('connected',response.statusCode);
                callback && callback(null,msg);
            });
        
            that.creq.on('aborted',function() {
                that.connected = false;
                that.creq = null;
                that.resp = null;
            });    
               
            that.creq.on('error',function(err) {
                that.emit('error',err,'error creq in XS1'); 
            });    
        } catch(e) {
            if (that.creq)
                that.creq.abort();
            that.connected = false;
            that.resp = null;
            that.creq = null;
            that.emit('error',e);
            callback && callback(e,msg);
        }
           
     
    };
    
    that.sendXS1 = function(command,callback) {
        var link = that.url+"control?callback=cb&x=" + Date.now() + "&cmd="+command;
        async.retry({times:5,interval:1000}, function(callb,data) {
            request(link, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var obj = safeJson(body.trim().slice(3,-1));
                    if (obj.error >"") {
                        that.emit('error',"sendXS1 returned ERROR: " + obj.error + ", "+ link);
                        return callb(obj.error,[]);
                    } else {
                        var t =null;
                        if (/actuator/.test(command))
                            t = "actuator";
                        if (/sensor/.test(command))
                            t = "sensor";
                        if (!t) {
                            that.emit('error',obj.type + "= unknown object result from XS1");
                            obj = [];
                        } else {
                            obj = obj[t];    
                        }
                    
                        if (Array.isArray(obj)) {
                            var na =[];
                            for (var key=0;key < obj.length;++key) {
                                if (obj[key].type != "disabled") {
                                    obj[key].styp = t;
                                    obj[key].lname = (t==='sensor'? 'Sensors.':'Actuators.')+obj[key].name;
                                    obj[key].number = key+1;
                                    na.push(obj[key]);
                                }
                            }
                            obj = na;
                        }
                    }
                    callb(null,obj);
                } else {
                    that.emit('error'," Error in request, will retry, "+error || response.statusCode);
                    callb(error || response.statusCode,body);
                }
            });
        }, function(err,data) {
            if (err) {
                that.emit('error',err);
                data = [];
            } 
            that.emit('xs1response',data);
            callback && callback(err,data); 
        });

    };


    that.setState = function(name,value,callback) {
        if (!that.names[name]) {
            that.emit("error","MyXS1.setState Name not found: "+name);
            return callback && callback("MyXS1.setState Name not found: "+name,null);
        }
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        var val = parseFloat(value);
        
        if (styp==="actuator") {
            if (typeof value === "boolean") {
                val = value ? 100 : 0;
            } else if (typeof value === "number") {
                val = value>100 ? 100 : (value<=0 ? 0 : parseInt(value));
            } else val = parseInt(value);
        }

        that.sendXS1("set_state_"+styp+"&number="+id+"&value="+val, function(err,obj) {
            callback && callback(err,obj);
        });
        
    };

    that.startXS1 = function(url,callback) {
        if (!url || !url.startsWith("http"))
            return that.emit('error', 'not a valid URL for XS1:'+url);

        if (url.substr(-1,1) !== '/')
             url =  url + '/'; 

        that.url = url;

        
        that.sendXS1("get_list_actuators",function(err,actuators) {
            if (err)
                return callback && callback(err,null);
            that.names = {};
            that.sendXS1("get_list_sensors",function(err,obj) {
                if (err)
                    return callback && callback(err,null);
                var all = obj.concat(actuators);
                for (var i=0;i<all.length;++i) {
                    var val = all[i];
                    that.names[val.name] = val;
                }
                that.connect(callback,all);
           });
        });  
    };


    that.getStyp = function(name) {
        return that.names[name].styp;
    };
    
    that.getNumber = function(name) {
        return that.names[name].number || 0;
    };

/*  not needed in adapter implementation  
     
    that.getState = function(name,callback) {
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        
        that.sendXS1("get_state_"+styp+"&number="+id, function(err,obj) {
            callback && callback(err,obj);
        });
        
    };


    that.getHistory = function(name,callback,from_s,to_s) {
        if (!name && ! callback)
            return that.emit("error","MyXS1.getHistory argument error:("+name+","+callback+","+from_s+","+to_s+')');
        if (!that.names[name]) {
            that.emit("error","MyXS1.getHistory id not found:("+name+","+callback+","+from_s+","+to_s+')');
            return callback("MyXS1.getHistory id not found:("+name+","+callback+","+from_s+","+to_s+')',null);
        }
        from_s = Math.floor((from_s || Date.now()-1000*60*60*24)/1000);
        to_s = Math.floor((to_s || Date.now())/1000);
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        
        that.sendXS1("get_state_"+styp+"&number="+id + "&sutime="+from_s+"&eutime="+to_s, function(err,obj) {
            if (err) return callback(err,[]);
            callback(null,obj.data);
        });
        
    };

    that.getStatistics = function(name,callback,from_s,to_s) {
        if (!name && ! callback)
            return that.emit("error","MyXS1.getHistory argumen error:("+name+","+callback+","+from_s+","+to_s);
        from_s = Math.floor((from_s || Date.now()-1000*60*60*24*365)/1000);
        to_s = Math.floor((to_s ||Date.now())/1000);
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        that.sendXS1("get_state_"+styp+"&number="+id + "&sutime="+from_s+"&eutime="+to_s+"&statistics", function(err,obj) {
            if (err)
                return callback(err,[]);
            callback(null,obj.statistics);
        });
        
    };
*/
}

util.inherits(MyXS1, EventEmitter);
// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = utils.adapter('xs1');

//adapter.log.info('Adapter SW loading');

var myXS1 =     new MyXS1();
var copylist =  {};

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        myXS1.disconnect();
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
        var idn = id.split('.');
        var name = idn[idn.length-1];
        var obj = myXS1.names[name];
        var typ = idn[idn.length-2];
        if (typ!=="Actuators") {
            adapter.log.warn("XS1 cannot set state of Sensor "+name+" to "+ objToString(state) );
        } else {
//            adapter.log.info(util.inspect(obj) + ' set to '+ objToString(state));
            myXS1.setState(name,state.val);
        }
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

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

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:

    adapter.log.info('config XS1 Addresse: ' + adapter.config.adresse);

    copylist = safeJson(adapter.config.copylist);
    if (!copylist)
        copylist = {};
// my personal one is
// '{"UWPumpeT2":"UWPumpe","UWPumpe":"UWPumpeT2","UWLicht":"UWLichtT3","UWLichtT3":"UWLicht","GartenLichtT1":"GartenLicht","GartenLicht":"GartenLichtT1"}'
    adapter.log.info("CopyList = "+objToString(copylist));

    myXS1.on("error",function(msg) {
        adapter.log.warn('Error message from XS1:'+ objToString(msg));
    });

    myXS1.startXS1(adapter.config.adresse, function(err,obj){
        if(err) {
            return adapter.log.error("Could not start XS1! Err:"+err);
        }
//        adapter.log.info("XS1 connected "+objToString(myXS1.names,1));
        async.forEachOfSeries(myXS1.names,function(o,n,callb)  {
//            var o =     myXS1.names[n];
//            var val =   o.value;
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


    myXS1.on('data',function(msg){
//        adapter.log.info("Data received "+objToString(msg) );
        if(msg && msg.lname) {
            msg.ack = true;
            msg.q = 0;
            adapter.setState(msg.lname+"."+msg.name,msg);
            var o = myXS1.names[msg.name];
            if (o) {
                o.oldValue = o.value;
                o.newValue = o.value = msg.val;
                var cl = copylist[msg.name];
                if (cl)
                    cl = cl.split(',');
                for (var i in cl) {
                    var cn = cl[i];
                    var co = myXS1.names[cn].value;
                    if (typeof o.newValue === 'boolean'  && typeof co === 'number')
                        co = co != 0;
//                    adapter.log.info(cn + "old " + co + " is new " +o.newValue);
                    if (co != o.newValue)
                        myXS1.setState(cn,o.newValue);
                }
            }
        }

    });


}

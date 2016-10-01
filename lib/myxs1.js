var request =       require('request');
var async =         require('async');
var util =          require('util');
var http =          require('http');

var EventEmitter =  require('events').EventEmitter;


function MyXS1() {
    
    
    if (!(this instanceof MyXS1)) return new MyXS1();
//    if (!url) throw 'MyXS1 url option not set!';
    EventEmitter.call(this);

    this.url = null;
    this.actuators = null;
    this.sensors = null;
    this.names = {};
    this.creq = null;
    this.resp = null;
    this.connected = false;

    var that = this;
    
    var types = { switch:"boolean", timerswitch:"boolean" };

    that.disconnect = function(callback) {
        if(!this.connected) {
            that.emit("error","XS1 disconnect called on not connected device!");
            return;
        }
        if (that.creq)
            that.creq.abort();
        that.connected = false;
        that.resp = null;
        that.creq = null;
//        that.emit('disconnected');
    };

    that.connect = function(callback,msg) {
        var url = that.url + "control?callback=cb&cmd=subscribe&format=txt&x="+Date.now();
        if (that.connected) {
            that.emit("error","XS1 connect called on already connected device!");
            return;
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
                    var st = {'A':"Actuator",'S':"Sensor"};
                    try {
                        data.ts = parseInt(b[0]) * 1000;
                        data.stype = st[b[9]];
                        data.number = b[10];
                        data.name = b[11];
                        data.vtype = b[12];
                        data.val = parseFloat(b[13]);
                        if (types[data.vtype]==="boolean")
                            data.val = data.val>0;
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
                    that.emit('msg','end resp'); 
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
                that.emit('msg','aborted creq',that.connected); 
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
                if (! stop && !error && response.statusCode == 200) {
                    var obj = safeJson(body.trim().slice(3,-1));
                    if (obj.error >"") {
                        that.emit('error',"sendXS1 returned ERROR: " + obj.error + ", "+ link);
                        return callb(obj.error,[]);
                    } else {
                        t =null;
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
                                    obj[key].lname = t+"."+obj[key].name;
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

    that.getState = function(name,callback) {
        var id = that.getNumber(name);
        var styp = that.getStyp(name);
        
        that.sendXS1("get_state_"+styp+"&number="+id, function(err,obj) {
            callback && callback(err,obj);
        });
        
    };

    that.setState = function(name,value,callback) {
        var fn = that.getName(name);
        if (!fn)
            return that.emit("error","MyXS1.setState Name not found: "+name);
        var id = that.getNumber(fn);
        var styp = that.getStyp(fn);
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

        
        that.sendXS1("get_list_actuators",function(err,obj) {
            if (err)
                return callback && callback(err,null);
            that.names = {};
            that.actuators =  obj;
            that.sendXS1("get_list_sensors",function(err,obj) {
                if (err)
                    return callback && callback(err,null);
                that.sensors = obj;
                var all = obj.concat(that.actuators);
                for (var i=0;i<all.length;++i) {
                    val = all[i];
                    if (val.lname) 
                        that.names[val.lname] = val;
                }
                that.connect(callback,all);
           });
        });  
    };


    that.getName = function(name) {
        if (that.names[name]!== undefined)
            return name;
        if (that.names["sensor."+name] !== undefined)
            return "sensor."+name;
        if(that.names["actuator."+name] !== undefined)
            return "actuator."+name;
        return null;
    };

    that.getStyp = function(name) {
        return that.names[that.getName(name)].styp;
    };
    
    that.getNumber = function(name) {
        return that.names[that.getName(name)].number || 0;
    };
    
    that.getHistory = function(name,callback,from_s,to_s) {
        if (!name && ! callback)
            return that.emit("error","MyXS1.getHistory argument error:("+name+","+callback+","+from_s+","+to_s);
        var nn = that.getName(name);
        if (!nn)
            return that.emit("error","MyXS1.getHistory id not found:("+name+","+callback+","+from_s+","+to_s);
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

}

util.inherits(MyXS1, EventEmitter);

exports.myXS1 = myXS1;
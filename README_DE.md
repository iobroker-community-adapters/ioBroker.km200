![Logo](admin/km200.png)
[![NPM version](http://img.shields.io/npm/v/iobroker.km200.svg)](https://www.npmjs.com/package/iobroker.km200)
[![Downloads](https://img.shields.io/npm/dm/iobroker.km200.svg)](https://www.npmjs.com/package/iobroker.km200)
[![Travis-CI](http://img.shields.io/travis/frankjoke/ioBroker.km200/master.svg)](https://travis-ci.org/frankjoke/ioBroker.km200)
[![AppVeyor](https://ci.appveyor.com/api/projects/status/github/frankjoke/ioBroker.km200?branch=master&svg=true)](https://ci.appveyor.com/project/frankjoke/ioBroker-km200/)

[![NPM](https://nodei.co/npm/iobroker.km200.png?downloads=true)](https://nodei.co/npm/iobroker.km200/)


# ioBroker.km200
=================
## ioBroker adapter Buderus KM200
  
[Englische Anleitung](README.md)  

Der Adapter unterstützt folgende Heizungsnalagen:
  
* Buderus mit den [Netzwerkadaptern](https://www.buderus.de/de/produkte/catalogue/alle-produkte/7719_gateway-logamatic-web-km200-km100-km50) KM50, KM100, KM200 und KM300 
* Junkers mit dem [Netzwerkapter](https://www.bosch-smarthome.com/de/de/mblani) MB LANi
* Bosch mit dem [Netzwerkapter](https://www.bosch-smarthome.com/de/de/mblani) MB LANi


Damit kann man über die Buderus-Webseite ([https://www.buderus-connect.de]) oder die 'EasyControl' App vom Handy steuern. App und Buderus-Website funktioniert auch mit Junkers und Bosch Heizungen.

Nun hab ich in einem Forum gelesen dass FHEM und SYMCON dafür Treiber/adapter anbieten. 
Diese sind jedoch in Perl und PHP geschrieben die ich beide überhaupt nicht kann. 
Habe mir den sourcecode trotzdem angeschaut und versucht zu analysieren und mit node.js
herumgespielt ob ich auch eine verschlüsselte Kommunikation ohne Fehler hinkriege.

Das ist jetzt in beide Richtungen gelungen und der Adapter ist jetzt schon voll verwendbar.

Dazu ist es notwendig zuerst die app auf einem Handy zu installieren und dort ein privates Passwort zu setzen, 
die App fragt nach dem Geräte Passwort und dem Loginnamen auf dem Gerät und dann kann man sein privates Passwort setzten.

Der Adapter braucht noch die IP (oder den Netzwerknamen, bei mir 'BuderusKM200.fritz.box') 
und die Portadrese (ist 80 am Gerät, aber falls ihr ihn über einen Router geändert habt... ).

Da der adapter die daten von der Anlage abfragen muß hab ich ein Update-Intervall definiert, 
das ist auf minimum 5 Minuten gesetzt da bei jedem Update alle Daten einzeln abgefragt werden müssen.

Meine Anlage (2 Heizkreise und ein Heisswasserkreis) liefert mehr als 150 Datenpunkte wo ich die meisten nicht brauchen kann und manche sind doppelt.

Deshalb hab ich eine Blak/Push-List eingeführt um bestimmte Daten ausblenden oder einblenden zu können.
Diese Liste besteht aus strings welche zu RegExp geformt werden und die Services in der Heizung werden dann danach gefiltert.

Die Syntax ist dass "/irgendwas*" oder "-/irgendwas*" alles ausblendet fas mit "/irgendwas" beginnt und dann beliebige Zeichen (oder nichts) dran hat.
Mit "+.*temp*" kann man alles einblenden was 'temp' enthält, und das hat Vorrang gegenüber dem Ausblened!

Meile Liste schaut so aus `["/gateway*","/recordings*",".*switchPrograms.*","/heatSource*",".*holidayModes.*"]` und blendet ca 90 der ~150 Datensätze meiner Anlage aus.

Seit V 1.1.2 können die Klammern und hochkommas weggelassen werden und die blockierten/gepushten Werte nur mit Beistrich getrennt geschrieben werden!

Die Anlage arbeitet mit Services die wie ein Verzeichnisbaum strukturiert sind und diese wird im Adapter nachgebildet.

## Important/Wichtig
* Adapter requires node >= v4.3.*!

## Changelog

### 1.1.7
* (Schmupu) Supports Admin3
* (Schmupu) Only device password and own password needed. You do not have to get the access code anymore. 

### 1.1.6 
* Adapter communication and retries more often to catch more errors.
* Writes are also retried
* Added right text for blocklist in config screen

### 1.1.2
* Adapter handles better communication and retries if he got an error.
* you can set debug-mode by adding 'debug!' in front of host.
* Host port is not required and can be added to hostname with :xxx at end.
* Simpler blocklist handling, does not ask device for services which are blocked

### 0.4.3
* Renamed repository to ioBroker.km200

### 0.4.3
* Cleaning of objects/states for current adapter instance which are not part of scanned services anymore.

### 0.4.2
* Some Small bug fixes and added some debug logs. Removed also dependency of 'request' and 'async' modules.

### 0.4.1
  Habe nur 'request' und 'async' mit --save nun auch ins package.json eingetragen... Merken: Nuícht --save vergessen :(!

### 0.4.0
  Strings mit allowedValues werden jetzt in beide Richtungen (Lesen & Schreiben) in ioBroker states umgewandelt

### 0.3.0
  Setzen von Variablen mit Zahlen oder Strings funktioniert nun. 
  Damit können z.B. Soll-Temperaturen verändert werden. 
  TODO: Enums und setzen von Tabellen

### 0.2.0
  Adapter funktioniert jetzt mit Blacklist und im Read-Only mode.
  TODO: Setzen von Werten im Heizsystem implementieren
  TODO: Variablen mit ENUMS (Wertelisten) implementieren

### 0.1.0
  Erster Test

## License
The MIT License (MIT)

Copyright (c) 2016 Frank Joke 

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

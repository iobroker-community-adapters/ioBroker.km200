# ioBroker.km200

![Logo](admin/km200.png)

## Für Buderus KM50/KM100/KM200/KM300 & Junkers/Bosch MB LANi

[![NPM version](http://img.shields.io/npm/v/iobroker.km200.svg)](https://www.npmjs.com/package/iobroker.km200)
[![Downloads](https://img.shields.io/npm/dm/iobroker.km200.svg)](https://www.npmjs.com/package/iobroker.km200)
[![Number of Installations](http://iobroker.live/badges/km200-installed.svg)](http://iobroker.live/badges/km200-installed.svg)
[![Travis-CI](http://img.shields.io/travis/frankjoke/ioBroker.km200/master.svg)](https://travis-ci.org/frankjoke/ioBroker.km200)
[![NPM](https://nodei.co/npm/iobroker.km200.png?downloads=true)](https://nodei.co/npm/iobroker.km200/)

  
[Englische Anleitung](README.md)  

Der Adapter unterstützt folgende Heizungsnalagen:
  
* Buderus mit den [Netzwerkadaptern](https://www.buderus.de/de/produkte/catalogue/alle-produkte/7719_gateway-logamatic-web-km200-km100-km50) KM50, KM100, KM200 und KM300 
* Junkers mit dem [Netzwerkapter](https://www.bosch-smarthome.com/de/de/mblani) MB LANi
* Bosch mit dem [Netzwerkapter](https://www.bosch-smarthome.com/de/de/mblani) MB LANi

Beim Zugriff auf die Systeme verwende ich code welcher von Andreas Hahn geschrieben wurde und in seinem Blog [da](https://www.andreashahn.info/2014/07/kernthema-am-eigenen-leibe) and [dort](https://www.andreashahn.info/2014/08/easycontrol-pro-unter-der-lupe-oder-m) beschrieben ist.

Damit kann man über die Buderus-Webseite ([https://www.buderus-connect.de]) oder die 'EasyControl' App vom Handy steuern. App und Buderus-Website funktioniert auch mit Junkers und Bosch Heizungen.

Dazu ist es notwendig zuerst die app auf einem Handy zu installieren und dort ein privates Passwort zu setzen, 
die App fragt nach dem Geräte Passwort und dem Loginnamen auf dem Gerät und dann kann man sein privates Passwort setzten.

Der Adapter braucht noch die IP (oder den Netzwerknamen, bei mir 'BuderusKM200.fritz.box') 
und die Portadrese (ist 80 am Gerät, aber falls ihr ihn über einen Router geändert habt... ).
Wenn man ein Rufzeichen `!` hinter die Adresse stellt schaltet der Adapter auf Debug-Mode und schreibt Zusatzinformationen ins log.

Da der adapter die daten von der Anlage abfragen muß hab ich ein Update-Intervall definiert, 
das ist auf minimum 5 Minuten gesetzt da bei jedem Update alle Daten einzeln abgefragt werden müssen.

Meine Anlage (2 Heizkreise und ein Heisswasserkreis) liefert mehr als 150 Datenpunkte wo ich die meisten nicht brauchen kann und manche sind doppelt.

Deshalb hab ich eine Blak/Push-List eingeführt um bestimmte Daten ausblenden oder einblenden zu können.
Diese Liste besteht aus strings welche zu RegExp geformt werden und die Services in der Heizung werden dann danach gefiltert.

Die Syntax erlaubt  `+` oder `-` vor jedes Element zu stellen. Ein '+' bedeutet dass STates die mit diesem Element matchen auf jeden fall abgefragt werden, ein '-' opder kein '+/-' bedeutet dass diese Elemente ausgefiltert werden sollen. Jedes Element selbst kann dann mit `/` oder `^` beginnen um den Anfang darzustellen, Ein '*' beschreibt beliebige ubd auch beliebig lange Elemente die auch irgendwo in der Mitte liegen können. Am Ende kann ein `$` stehen um das Ende zu bezeichnen.
Beispiele: Mit `+*temp*` wird alles was 'temp' enthält gescannt, mit `_Hourly$` wird alles was mit '_Hourly' endet ausgefiltert. Stehen beide Elemente in der Liste würden alle mit _Hourly am Ende ausgefiltert werden welche kein temp enthalten..

Meine Liste schaut so aus ( ich brauche keine recordings siehe unten) `/gateway*, /recordings*,*SwitchPrograms*,/HeatSource*, *HolidayModes*` und sie filtert ca. die Hälfte der ~180 abfragbaren Punkte aus.

In der neuen Version sind auch zwei neue Abfrageintervalle verfügbar. In den `fast` und `slow`-Listen können Elemente (ohne '+/-') gelistet werden welche scheller oder langsamer als die normale liste abgefragt werden. Die schnelle 'fast'-Liste kann im Minutenbereich Daten abrufen, die langsame 'slow'-Liste im Stundenbereich. Übrigens, alle Datenpunkte die nicht ausgefiltert werden und nich in den schnell/langsam-Listen stehen werden nurmal ausgelesen!
z.B. ist es sinnlos _DAILY ider _Monthly in der normalen oder schenellen Liste abzufragen da sie sich nur 1x am Tag ändert.

Die 'recording'-Daten sind kleine Arrays die Datenpunkte in der Vergangenheit zeigen. '_Hourly' sind Daten der letzten 48 Stunden, '_Daily' sind von denletzten 2 Monaten und _Monthly von den letzten 2 Jahren wobei es auch datenpunkte gibt die nicht all diese Zeiten oder Längen zur Verfügung stellen. 

`switchPrograms` können nun auch gelesen werden, das Format ist ein JSON-String das ein Array von Wochentagen abbildet, bitte das Format NICHT ändern und nur die Zahklen ändern wenn ihr es schreibt da sonst ein Fehler auftritt! Es schaut aus dass die Werte Minuten sind und dass nur 15-Minuten-Intervalle erlaubt sind.

Seit V 1.1.2 können die Klammern und hochkommas weggelassen werden und die blockierten/gepushten Werte nur mit Beistrich getrennt geschrieben werden!

Die Anlage arbeitet mit Services die wie ein Verzeichnisbaum strukturiert sind und diese wird im Adapter nachgebildet.

### Wichtig falls Adapter von Version 1.1.* upgedated wird

Wenn sie den 64-Zeichen-Access-Key haben brauchen sie kein richtiges privates Passwort, es darf nur nicht leer sein!

## Important/Wichtig

* Adapter requires node >= v6.1.*!

## Todo

* Bessere Sprachunterstüzung und texte in mehreren Sprachen fü einige Elemente

## Changelog

### 2.0.2

* Adapter Konfig Update
* Die Blacklist funktioniert jetzt in allen Situationen
* Eine Abfrage ob alle unbenutzen States gelöscht werden sollen wurde hinzugefügt

### 1.9.9

* Beta für v2.0.0
* Unterstützung von 'recordings'-Datenpunkten
* Änderung der Anzeige von 'mins' in normale Zahlenwerte um die Felder beschreibbar zu machen.
* Zwei neue Zeitintervalle für schnelle (`fast`) und langsamere (`slow`) Abfragen.
* Die Blocklist Syntax wurde leicht geändert. `/` oder `^` für den Beginn, `*` kann irgendwo stehen und  `$` am Ende
* Unterstützung von switchPrograms beim Lesen und Schreiben!

### 1.2.4

* Betaversion für nächstes Update. Es werden jetzt auch die 'recordings' ausgelesen!

### 1.2.3
* Habe Änderungen vorgenommen um auch switchPrograms anzuzeigen


### 1.2.2
* Adapter funktioniert auch nur mit accesskey im alten hex-format ohne private passwort.

### 1.2.1 
* Adapter unterstützt neuen 'Compact'-Mode von js-controller2
* Adapter benutzt nicht mehr mcrypt wodurch er auf allen Platformen nutzbar wird
* Adapter versteht speziellen debug-Mode mit '!' am Ende der Adresse
* Adapter braucht node >=v6

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

Copyright (c) 2016-2020 Frank Joke <frankjoke@hotmail.com>

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

![Logo](admin/km200.png)
# ioBroker.km200
=================
## ioBroker adapter Buderus KM200
  Buderus liefert mit dem KM200 eine Netzwerkanbindung ihrer Heizungen [https://www.buderus.de/de/produkte/catalogue/alle-produkte/7719_gateway-logamatic-web-km200-km100-km50].
  Es gibt laut den Foren auch KM50, KM100 und in nder Zwischenzeit auch ein KM300 welche anscheinend ähnlich funktionieren,
  leider kann ich das nicht testen da ich nur eine KM200-Box hab, aber ich bitte euch den Adapter auf anderen Systemen zu testen.

  Damit kann man über die Buderus-Webseite ([https://www.buderus-connect.de]) oder die 'EasyControl' app vom Handy steuern.
  Nun hab ich in einem Forum gelesen dass FHEM und SYMCON dafür Treiber/adapter anbieten. 
  Diese sind jedoch in Perl und PHP geschrieben die ich beide überhaupt nicht kann. 
  Habe mir den sourcecode trotzdem angeschaut und versucht zu analysieren und mit node.js
  herumgespielt ob ich auch eine Kommunikation ohne Fehler hinkriege.

  Das ist mir jetzt gelungen und ich hab das ganze in diesem Adapter verbaut.

  Momentan ist er nur 'read-only' was bedeutet man kann noch keine Daten zur Heizung schicken 
  (also z.B. die gewünschte Temperatur ändern), das steht in der TODO-Liste ganz oben.

  Das System brauch einen Access-Key um die Daten ver- und entschlüsseln zu können.
  Leider mußte der Code zur Generierung des Schlüssels wege Urheberrechtlichen Gründen vom Netz genommen werden 
  aber ein Symcon-Nutzer hat ein eigenes Webtool kreiert mit dem man den Key anfertigen kann.

  Dazu ist es notwendig zuerst die app auf einem Handy zu installieren und dort das Passwort zu setzen, 
  die App fragt nach dem Passwort und dem Loginnamen auf dem Gerät und dann kann man sein Passwort setzten.

  Dieses selbst gesetzte Passwort und das Gerätelogin werden dann auf der Webseite [https://ssl-account.com/km200.andreashahn.info/]
  eingegeben und man erält seinen AccessKey (ein 64 Zeichen langes Hex-String). Dieser ist im Adapterkonfig einzugeben.
  Der Adapter brauch noch die IP (oder den Netzwerknamen, bei mir 'BuderusKM200.fritz.box') 
  und die Portadrese (ist 80 am Gerät, aber falls ihr ihn über einen Router geändert habt... ).

  Da der adapter die daten von der Anlage abfragen muß hab ich ein Update-Intervall definiert, 
  das ist auf minimum 5 Minuten gesetzt da bei jedem Update alle Daten einzeln abgefragt werden müssen.

  Meine Anlage (2 Heizkreise und ein Heisswasserkreis) liefert mehr als 150 Datenpunkte wo ich die meisten nicht brauchen kann und manche sind doppelt.

  Deshalb hab ich eine Blak/Push-List eingeführt um bestimmte Daten ausblenden oder einblenden zu können.
  Diese Liste besteht aus strings welche zu RegExp geformt werden und die Services in der Heizung werden dann danach gefiltert.

  Die Syntax ist dass "/irgendwas*" oder "-/irgendwas*" alles ausblendet fas mit "/irgendwas" beginnt und dann beliebige Zeichen (oder nichts) dran hat.
  Mit "+.*temp*" kann man alles einblenden was 'temp' enthält, und das hat Vorrang gegenüber dem Ausblened!

  Meile Liste schaut so aus `["/gateway*","/recordings*",".*switchPrograms.*","/heatSource*"]` und blendet ca 100 der ~150 Datensätze meiner Anlage aus.

  Die Anlage arbeitet Services die wie ein Verzeichnisbaum strukturiert sind und diese wird im Adapter nachgebildet.

## Changelog

### 0.2.0
  Adapter functioniert jetzt mit Blacklist und im Read-Only mode.
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

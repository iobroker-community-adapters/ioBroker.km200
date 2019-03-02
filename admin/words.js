/*global systemDictionary:true */
'use strict';

systemDictionary = {
    "KM200 adapter settings": {
        "de": "Buderus KM200",
        "ru": "Buderus KM200"
    },
    "address": {
        "en": "Link to KM200",
        "de": "KM200 Link",
        "ru": "KM200 link"
    },
    "port": {
        "en": "Port (80 default)",
        "de": "Port (80 default)"
    },
    "blacklist": {
        "en": 'list of names (can be parts with "*") to disable generating states from KM200 like: "/Gateway*", "/recordings/*',
        'de': 'Liste der Namen (Können auch Teile sein mit "*") welche keine States vom KM200 generieren sollen wie: "/Gateway*", "/recordings/*'
    },
    "interval": {
        "en": "Intrevall for polling (default 15 minutes, minimum 5 minutes)",
        "de": "Intervall in Min (15 standard, 5 minimum)"
    },
    "accesskey": {
        "en": "Accesskey generation on Webseite https://ssl-account.com/km200.andreashahn.info/",
        "de": "Key, auf Webseite https://ssl-account.com/km200.andreashahn.info/ generiert!"
    },
    "Description": {
        "en": "Please provide link to KM200 as ip addess or network name! On save adapter restarts with new config immediately",
        "de": "Bitte Linkadresse angeben als ip-Adresse oder Netzwerkname angeben! Beim Speichern von Einstellungen wird der Adapter sofort neu gestartet.",
        "ru": "Сразу после сохранения настроек драйвер перезапуститься с новыми значениями"
    },
    "Gateway Password": {
        "en": "Device password",
        "de": "Gerätepasswort"
    },
    "Private Password": {
        "en": "Private password",
        "de": "Privates Passwort"
    }
};
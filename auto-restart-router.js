let failCount = 0;
const maxFails = 3;                // 3 fehlgeschlagene Tests → Neustart
const checkInterval = 60000;       // alle 60s prüfen
const rebootDelay = 60000;         // 60s ausgeschaltet
const waitTimeout = 300000;        // 5 Minuten maximal auf Internet warten

let rebootInProgress = false;
let waitStart = 0;

function change_color_LEDs(red, green, blue, brightness) {
    try {
        let config = {
            "config": {
                "leds": {
                    "mode": "switch",
                    "colors": {
                        "switch:0": {
                            "on": { "rgb": [red, green, blue], "brightness": brightness },
                            "off": { "rgb": [red, green, blue], "brightness": brightness }
                        }
                    }
                }
            }
        };
        Shelly.call("PLUGS_UI.SetConfig", config);
    } catch (e) {
        print("*** LED ERROR:", e.message);
    }
}

function ledRed()    { change_color_LEDs(100, 0, 0, 100); }
function ledGreen()  { change_color_LEDs(0, 100, 0, 5); }
function ledBlue()   { change_color_LEDs(0, 0, 100, 30); }
function ledYellow() { change_color_LEDs(100, 100, 0, 30); }
function ledWhite()  { change_color_LEDs(100, 100, 100, 100); }

let internetBlinkTimer = null;
let blinkState = false;

function startBlinkInternet() {
    if (internetBlinkTimer) return; // bereits aktiv
    internetBlinkTimer = Timer.set(500, true, function() {
        if (blinkState) change_color_LEDs(0,0,0,0);
        else change_color_LEDs(100,100,0,100); // Gelb
        blinkState = !blinkState;
    });
}

function stopBlinkInternet() {
    if (internetBlinkTimer) {
        Timer.clear(internetBlinkTimer);
        internetBlinkTimer = null;
        blinkState = false;
        ledGreen();
    }
}

function checkInternet() {
    if (rebootInProgress) return;

    Shelly.call("HTTP.GET", { url: "https://dns.google", timeout: 3 }, function(result, error_code) {
        if (error_code !== 0) {
            failCount++;
            print("Internet-Check fehlgeschlagen:", failCount);
            startBlinkInternet();
            if (failCount >= maxFails) startReboot();
        } else {
            failCount = 0;
            stopBlinkInternet();
            ledGreen();
            print("Internet OK.");
        }
    });
}

function startReboot() {
    print("INTERNET DOWN – Starte Router neu...");
    rebootInProgress = true;
    failCount = 0;

    stopBlinkInternet();
    ledRed();
    Shelly.call("Switch.set", { id: 0, on: false });

    Timer.set(rebootDelay, false, function () {
        print("Router wieder einschalten...");
        Shelly.call("Switch.set", { id: 0, on: true });

        ledBlue();
        waitStart = Date.now();
        waitForInternet();
    });
}

function waitForInternet() {
    Timer.set(checkInterval, false, function() {
        Shelly.call("HTTP.GET", { url: "https://dns.google", timeout: 3 }, function(result, error_code) {
            if (error_code === 0) {
                print("Internet wieder da.");
                rebootInProgress = false;
                ledGreen();
                stopBlinkInternet();
            } else {
                if (Date.now() - waitStart > waitTimeout) {
                    print("Router reagiert nicht. Starte erneut.");
                    startReboot();
                } else {
                    ledBlue();
                    waitForInternet();
                }
            }
        });
    });
}

ledWhite();
print("Skript gestartet.");

Shelly.call("Switch.set", { id: 0, on: true });
print("Steckdose eingeschaltet.");

Timer.set(5000, false, checkInternet);

Timer.set(checkInterval, true, checkInternet);

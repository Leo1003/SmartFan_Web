const SerialPort = require('serialport');
const ffi = require('ffi');
const ref = require('ref');
const debug = require('debug')('SmartFan_Web:fan');
const repeat = require('repeat').default;

const doublePtr = ref.refType('double');

const port = new SerialPort('/dev/ttyUSB0', { baudRate: 9600 });

const smartfan = ffi.Library(__dirname + '/libsmartfan', {
    'power_up': ['bool', []],
    'power_off': ['bool', []],
    'state': ['int', [doublePtr]],
    'set_iter': ['void', ['int']],
    'set_idleness': ['void', ['int']],
    'set_theta': ['void', ['double']],
})

function fan_off() {
    port.write('o', 'ascii', (err) => {
        if (err) {
            return console.error(err);
        }
        debug("Fan off");
    });
}

function fan_on() {
    port.write('n', 'ascii', (err) => {
        if (err) {
            return console.error(err);
        }
        debug("Fan on");
    });
}

function fan_top_rot_on() {
    debug("Requesting Top on...");
    port.write('a', 'ascii', (err) => {
        if (err) {
            return console.error(err);
        }
        debug("Top on");
    });
}

function fan_top_rot_off() {
    debug("Requesting Top off...");
    port.write('m', 'ascii', (err) => {
        if (err) {
            return console.error(err);
        }
        debug("Top off");
    });
}

function fan_rotote(angle) {
    let data = '0';
    if (angle < 0) {
        data = '-';
    }
    if (angle > 0) {
        data = '+';
    }
    port.write(data, 'ascii', (err) => {
        if (err) {
            return console.error(err);
        }
        debug(`Fan rotate: ${angle} degree`);
    });
}

class Fan {
    constructor() {
        this.power = false;
        this.mode = 2;
        this.rpm = 0;
        this.running = false;
        this.fanning = false;
        var _this = this;
        this.task = repeat().do(() => {
            _this._detect_loop();
        });
        this.refresh();
        smartfan.set_iter(10);
        smartfan.set_idleness(60);
        smartfan.set_theta(Math.PI / 4.0);
    }

    getjson() {
        return {
            power: this.power,
            mode: this.mode,
            rpm: this.rpm,
        }
    }

    refresh() { // update status
        //TODO: Do some stuff
    }

    setPower(value) { // on off
        if (typeof value === "boolean") {
            this.power = value; // true false

            if (this.power) {
                this._start_loop();
            } else {
                this._stop_loop();
            }

            console.log(`Power Value: ${this.power}`)
        }
    }

    setMode(value) { // set
        if (typeof value === "number") {
            this.mode = value; // 0 1 2
            if (this.fanning) {
                if (this.mode == 0) {
                    fan_top_rot_on();
                } else if (this.mode == 2) {
                    fan_top_rot_off();
                }
            }
            console.log(`Mode: ${this.mode}`)
        }
    }

    setRPM(value) {
        if (typeof value === "number") {
            this.rpm = value; // mode of rpm, 0 1 2
            //TODO: Do some stuff
            console.log(`Mode of RPM: ${this.rpm}`)
        }
    }

    _start_loop() {
        let success = smartfan.power_up();
        debug(`smartfan power_up(): ${success}`);
        if (!success) {
            return;
        }
        this.running = true;
        this.task.every(1000);
    }

    _stop_loop() {
        debug(`smartfan power_off(): ${smartfan.power_off()}`);
        this.running = false;
        this.fanning = false;
        fan_off();
        fan_top_rot_off();
        this.task.cancel();
    }

    _detect_loop() {
        debug("loop run...");
        let outTheta = ref.alloc('double');
        let status = smartfan.state(outTheta);
        debug(`status: ${status}`);
        if (status == 0) {
            fan_off();
            fan_top_rot_off();
            this.fanning = false;
        } else if (status == 1) {
            fan_on();
            if (this.mode == 0) {
                fan_top_rot_on();
            } else if (this.mode == 2) {
                fan_top_rot_off();
            }
            this.fanning = true;
        } else if (status == 2) {
            if (!this.fanning) {
                fan_on();
                if (this.mode == 0) {
                    fan_top_rot_on();
                } else if (this.mode == 2) {
                    fan_top_rot_off();
                }
            }

            if (this.mode == 2) {
                let theta = outTheta.deref();
                debug(`theta: ${theta}`);
                let angle = Math.round(theta * 180 / Math.PI);
                debug(`Angle: ${angle}`);
                if (Math.abs(angle) >= 5) {
                    fan_rotote(angle);
                }
            } else {
                debug("Not in detect mode");
            }
        } else if (status == 3) {
            //nothing
        }
    }
}

module.exports = Fan;
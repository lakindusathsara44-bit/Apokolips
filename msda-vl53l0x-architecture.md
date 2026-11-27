# MSDA Phase 2 — Short-range distance architecture

## Goal
Add genuine short-range distance measurement in millimetres while retaining the existing digital IR obstacle detector.

## Architecture

```text
                  USB Serial / 115200 baud
Arduino UNO  --------------------------------->  MSDA web dashboard
    |                                                |
    | D2                                             | live mm value
    +---- 3-pin digital IR sensor                    | min / max
    |      HIGH/LOW object threshold                 | time-series chart
    |                                                | CSV export
    | I2C (SDA=A4, SCL=A5)                            |
    +---- VL53L0X Time-of-Flight sensor --------------+
           distance_mm + valid flag
```

## Sensor roles
- **VL53L0X:** actual time-of-flight distance readings. The firmware emits `range_sample` records in millimetres. The dashboard displays only valid readings.
- **Existing 3-pin IR module:** binary object detection on D2. It remains useful as a separate presence/threshold sensor; it is not a distance meter.

## Arduino UNO wiring

| Module pin | UNO pin |
|---|---|
| IR VCC | 5V |
| IR GND | GND |
| IR OUT | D2 |
| VL53L0X SDA | A4 |
| VL53L0X SCL | A5 |
| VL53L0X GND | GND |
| VL53L0X VIN | 5V only when the breakout explicitly supports 5V input |

**Power warning:** a bare VL53L0X chip/module is a 2.8V device. Do not connect a bare sensor's VIN or I2C pins directly to 5V. Use a breakout with regulator and level shifting, or provide the correct regulated supply and logic levels. Confirm the exact breakout board before wiring.

## Firmware
- File: `msda-uno-vl53l0x.ino`
- Install **Pololu VL53L0X** from Arduino Library Manager.
- Serial baud: 115200.
- IR sample interval: 20 ms.
- ToF continuous interval: 50 ms.
- I2C default address: 0x29.

## Serial data
Example valid reading:
```json
{"type":"range_sample","seq":12,"ms":650,"distance_mm":247,"valid":true,"status":"ok"}
```
Timeout/out-of-range readings use `valid:false` and `distance_mm:0`. The dashboard does not treat these as zero-distance measurements.

## Limitations
VL53L0X is a short-range ToF sensor (nominally up to around 2 m in suitable conditions; real performance depends on target reflectivity, ambient light, optics, alignment and module quality). This is not a guaranteed accuracy/range specification. For sub-millimetre precision, a different instrument is required. The IR obstacle sensor cannot provide continuous mm readings.

## Browser
Web Serial requires a supported desktop Chrome/Edge browser and HTTPS. Close Arduino IDE Serial Monitor before connecting the web dashboard. The page may still load on mobile, but Web Serial support is not guaranteed there.

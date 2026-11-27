# Healthdiuno Serial Protocol v1

Healthdiuno communicates with board firmware over USB serial at 115200 baud. Messages are UTF-8 JSON objects terminated by a newline. The browser sends commands; the firmware returns event objects.

## Browser → board

```json
{"cmd":"hello","app":"Healthdiuno","protocol":1,"board":"auto"}
{"cmd":"diagnostic_scan","protocol":1,"profile":"auto","tests":["identity","digital","analog","pwm","power","uart","i2c","spi","reset","system"]}
```

## Board → browser

Connection identity:

```json
{"type":"hello","board":"Arduino UNO R3","mcu":"ATmega328P","firmware":"Healthdiuno","protocol":1}
```

Individual test result:

```json
{"type":"test","test":"Microcontroller identity","status":"PASS","details":"ATmega328P responding"}
```

Pin results:

```json
{"type":"pins","pins":[{"pin":"D2","status":"PASS"},{"pin":"A0","status":"INFO"}]}
```

End of scan:

```json
{"type":"scan_complete"}
```

Allowed statuses are `PASS`, `FAIL`, and `INFO`. Use `INFO` when a test is not run or needs a dedicated fixture. Never report an unperformed test as PASS.

## Firmware profile design

Each board profile supplies its MCU identity, pin map, ADC capabilities, PWM-capable pins, voltage measurement channels, and supported peripheral tests. Profiles must be selected by board identity or an explicit user selection; do not assume that all boards share the same pin numbering or voltage levels.

The included sketches establish the serial protocol and identify the connected MCU. Board-specific electrical tests and fixture routines are added through individual profiles.

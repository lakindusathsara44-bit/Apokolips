/*
  APOKOLIPS MSDA — Short-range ToF + IR firmware
  Board: Arduino UNO
  Library: Pololu VL53L0X (install from Arduino Library Manager)

  IR obstacle module:
    VCC -> 5V, GND -> GND, OUT -> D2
  VL53L0X breakout:
    VIN -> 5V ONLY if the breakout explicitly supports 5V input
    GND -> GND
    SDA -> A4
    SCL -> A5
  Bare VL53L0X sensors need regulated 2.8V and level-safe I2C.

  Serial: 115200 baud, newline-delimited JSON.
  Distance is reported only from the ToF sensor, in millimetres.
*/
#include <Arduino.h>
#include <Wire.h>
#include <VL53L0X.h>

const byte IR_OUT_PIN = 2;
const byte IR_DETECTED_LEVEL = LOW; // Common FC-51 modules are active LOW.
const unsigned long IR_INTERVAL_MS = 20;
const unsigned long RANGE_INTERVAL_MS = 50;

VL53L0X tof;
bool tofReady = false;
unsigned long lastIrAt = 0;
unsigned long lastRangeAt = 0;
unsigned long irSequence = 0;
unsigned long rangeSequence = 0;

void setup() {
  pinMode(IR_OUT_PIN, INPUT);
  Serial.begin(115200);
  Wire.begin();

  const unsigned long started = millis();
  while (!Serial && millis() - started < 1800) {
    // Do not block forever when USB serial is not opened.
  }

  tof.setTimeout(500);
  tofReady = tof.init();

  if (tofReady) {
    tof.setMeasurementTimingBudget(33000);
    tof.startContinuous(RANGE_INTERVAL_MS);
  }

  Serial.print(F("{\"type\":\"hello\",\"project\":\"MSDA\",\"phase\":2,\"board\":\"uno\",\"sensor\":\"VL53L0X+digital-ir\",\"tof_ready\":"));
  Serial.print(tofReady ? F("true") : F("false"));
  Serial.println(F(",\"baud\":115200}"));
}

void loop() {
  const unsigned long now = millis();

  if (now - lastIrAt >= IR_INTERVAL_MS) {
    lastIrAt = now;
    const int raw = digitalRead(IR_OUT_PIN);
    const bool detected = (raw == IR_DETECTED_LEVEL);

    Serial.print(F("{\"type\":\"sample\",\"seq\":"));
    Serial.print(irSequence++);
    Serial.print(F(",\"ms\":"));
    Serial.print(now);
    Serial.print(F(",\"raw\":"));
    Serial.print(raw);
    Serial.print(F(",\"detected\":"));
    Serial.print(detected ? F("true") : F("false"));
    Serial.println(F("}"));
  }

  if (tofReady && now - lastRangeAt >= RANGE_INTERVAL_MS) {
    lastRangeAt = now;
    const uint16_t distanceMm = tof.readRangeContinuousMillimeters();
    const bool timedOut = tof.timeoutOccurred();
    const bool valid = !timedOut && distanceMm > 0 && distanceMm < 8190;

    Serial.print(F("{\"type\":\"range_sample\",\"seq\":"));
    Serial.print(rangeSequence++);
    Serial.print(F(",\"ms\":"));
    Serial.print(now);
    Serial.print(F(",\"distance_mm\":"));
    Serial.print(valid ? distanceMm : 0);
    Serial.print(F(",\"valid\":"));
    Serial.print(valid ? F("true") : F("false"));
    Serial.print(F(",\"status\":\""));
    Serial.print(timedOut ? F("timeout") : (valid ? F("ok") : F("out_of_range")));
    Serial.println(F("\"}"));
  }
}

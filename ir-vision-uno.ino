/*
  APOKOLIPS IR VISION — Arduino UNO + 3-pin digital IR obstacle sensor
  Sensor pins: VCC -> 5V, GND -> GND, OUT -> D2
  Serial: 115200 baud, newline-delimited JSON.

  IMPORTANT:
  - Many FC-51 / LM393 obstacle modules are active-LOW:
    OUT LOW = reflected IR detected; OUT HIGH = no detection.
  - If your module behaves oppositely, change DETECTED_LEVEL to HIGH.
  - This is a proximity/detection sensor, NOT an imaging or thermal camera.
*/

#include <Arduino.h>

const byte IR_OUT_PIN = 2;
const byte DETECTED_LEVEL = LOW;   // Change to HIGH only if your module is active-HIGH.
const unsigned long SAMPLE_INTERVAL_MS = 50;

unsigned long lastSampleAt = 0;
unsigned long sampleSequence = 0;

void setup() {
  pinMode(IR_OUT_PIN, INPUT);
  Serial.begin(115200);

  // Wait briefly for USB serial; do not block sensor operation indefinitely.
  unsigned long waitStarted = millis();
  while (!Serial && millis() - waitStarted < 1800) {
    // USB serial readiness wait (UNO-compatible timeout).
  }

  Serial.println(F("{\"type\":\"hello\",\"sensor\":\"digital-ir-obstacle\",\"board\":\"uno\",\"baud\":115200}"));
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;

    const int raw = digitalRead(IR_OUT_PIN);
    const bool detected = (raw == DETECTED_LEVEL);

    Serial.print(F("{\"type\":\"sample\",\"seq\":"));
    Serial.print(sampleSequence++);
    Serial.print(F(",\"ms\":"));
    Serial.print(now);
    Serial.print(F(",\"raw\":"));
    Serial.print(raw);
    Serial.print(F(",\"detected\":"));
    Serial.print(detected ? F("true") : F("false"));
    Serial.println(F("}"));
  }
}

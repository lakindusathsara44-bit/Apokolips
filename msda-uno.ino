/*
  APOKOLIPS MSDA — Phase 1
  Arduino UNO + 3-pin digital IR obstacle sensor
  Wiring: VCC -> 5V, GND -> GND, OUT -> D2
  Serial: 115200 baud, newline-delimited JSON

  IMPORTANT: This module provides a digital threshold output only.
  It does NOT measure distance in mm/cm. The website analyses state,
  transition timing, pulse duration and repeatability.
*/
#include <Arduino.h>

const byte IR_OUT_PIN = 2;
const byte DETECTED_LEVEL = LOW; // Common FC-51/LM393 modules are active LOW.
const unsigned long SAMPLE_INTERVAL_MS = 20;

unsigned long lastSampleAt = 0;
unsigned long sequenceNumber = 0;

void setup() {
  pinMode(IR_OUT_PIN, INPUT);
  Serial.begin(115200);

  const unsigned long started = millis();
  while (!Serial && millis() - started < 1800) {
    // Bounded wait: UNO continues even if USB serial is not opened.
  }

  Serial.println(F("{\"type\":\"hello\",\"sensor\":\"digital-ir-obstacle\",\"project\":\"MSDA\",\"phase\":1,\"board\":\"uno\",\"baud\":115200,\"interval_ms\":20}"));
}

void loop() {
  const unsigned long now = millis();
  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;

    const int raw = digitalRead(IR_OUT_PIN);
    const bool detected = (raw == DETECTED_LEVEL);

    Serial.print(F("{\"type\":\"sample\",\"seq\":"));
    Serial.print(sequenceNumber++);
    Serial.print(F(",\"ms\":"));
    Serial.print(now);
    Serial.print(F(",\"raw\":"));
    Serial.print(raw);
    Serial.print(F(",\"detected\":"));
    Serial.print(detected ? F("true") : F("false"));
    Serial.println(F("}"));
  }
}

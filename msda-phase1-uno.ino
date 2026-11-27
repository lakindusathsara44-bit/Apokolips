/*
  APOKOLIPS MSDA — PHASE 1
  Board: Arduino UNO
  Sensor: 3-pin digital IR obstacle sensor (LM393 type)
  Wiring: VCC -> 5V, GND -> GND, OUT -> D2
  Serial: 115200 baud, newline-delimited JSON

  IMPORTANT:
  This sensor reports only a digital detection state.
  It does NOT measure distance in mm/cm/m.
  If your module is active-HIGH, change DETECTED_LEVEL to HIGH.
*/
#include <Arduino.h>

const byte IR_OUT_PIN = 2;
const byte DETECTED_LEVEL = LOW;
const unsigned long SAMPLE_INTERVAL_MS = 50;

unsigned long lastSampleAt = 0;
unsigned long sequenceNumber = 0;

void setup() {
  pinMode(IR_OUT_PIN, INPUT);
  Serial.begin(115200);

  const unsigned long startedAt = millis();
  while (!Serial && millis() - startedAt < 1800) {
    // Allow USB serial to become ready on compatible boards.
  }

  Serial.println(F("{\"type\":\"hello\",\"device\":\"Apokolips MSDA\",\"board\":\"uno\",\"sensor\":\"digital-ir-obstacle\",\"baud\":115200}"));
}

void loop() {
  const unsigned long now = millis();

  if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
    lastSampleAt = now;

    const int raw = digitalRead(IR_OUT_PIN);
    const bool detected = (raw == DETECTED_LEVEL);

    Serial.print(F("{\"type\":\"sample\",\"sensor\":\"digital-ir\",\"seq\":"));
    Serial.print(sequenceNumber++);
    Serial.print(F(",\"ms\":"));
    Serial.print(now);
    Serial.print(F(",\"raw\":"));
    Serial.print(raw);
    Serial.print(F(",\"detected\":"));
    Serial.print(detected ? F("true") : F("false"));
    Serial.println(F(",\"distance_mm\":null}"));
  }
}

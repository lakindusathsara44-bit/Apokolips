/*
  SILENT CLASSROOM INDICATOR
  Arduino UNO + MAX4466 microphone module

  Wiring:
    MAX4466 VCC -> Arduino UNO 5V
    MAX4466 GND -> Arduino UNO GND
    MAX4466 OUT -> Arduino UNO A0

  Serial protocol: 115200 baud
    SCI,<filtered_peak_to_peak_ADC_counts>

  The Arduino applies an envelope smoother:
    - fast attack when sound rises
    - slow release when sound falls
  This prevents a very short quiet gap from forcing the reading to zero.

  The browser applies a separate 1.5-second silence grace period and
  threshold hysteresis before resetting its five-minute noise timer.

  IMPORTANT: Values are relative ADC counts, NOT calibrated dB/SPL.
  LEDs and buzzer are browser indicators in this version.
*/

const byte MIC_PIN = A0;
const unsigned int SAMPLE_COUNT = 180;
const unsigned int SAMPLE_GAP_US = 60;

const float ATTACK_TIME_MS = 70.0;
const float RELEASE_TIME_MS = 650.0;

float filteredLevel = 0.0;
bool filterInitialized = false;
unsigned long previousSampleTime = 0;

void setup() {
  Serial.begin(115200);
  pinMode(MIC_PIN, INPUT);
}

void loop() {
  int signalMin = 1023;
  int signalMax = 0;

  for (unsigned int i = 0; i < SAMPLE_COUNT; i++) {
    const int sampleValue = analogRead(MIC_PIN);
    if (sampleValue < signalMin) signalMin = sampleValue;
    if (sampleValue > signalMax) signalMax = sampleValue;
    delayMicroseconds(SAMPLE_GAP_US);
  }

  const int peakToPeak = signalMax - signalMin;
  const unsigned long now = millis();

  if (!filterInitialized) {
    filteredLevel = (float)peakToPeak;
    previousSampleTime = now;
    filterInitialized = true;
  } else {
    float elapsedMs = (float)(now - previousSampleTime);
    previousSampleTime = now;
    if (elapsedMs > 250.0) elapsedMs = 250.0;

    const float timeConstant =
      ((float)peakToPeak > filteredLevel)
        ? ATTACK_TIME_MS
        : RELEASE_TIME_MS;

    const float alpha = elapsedMs / (timeConstant + elapsedMs);
    filteredLevel += ((float)peakToPeak - filteredLevel) * alpha;
  }

  Serial.print(F("SCI,"));
  Serial.println((int)(filteredLevel + 0.5f));
  delay(8);
}

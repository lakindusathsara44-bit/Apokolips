/*
  SILENT CLASSROOM INDICATOR
  Arduino UNO + MAX4466 microphone module
  Wiring: VCC -> 5V, GND -> GND, OUT -> A0

  Serial output at 115200 baud:
    SCI,<filtered_peak_to_peak_ADC_counts>
    STATE,<0_or_1>

  Website commands (newline terminated):
    MODE,FIXED
    MODE,WEB
    TH,<ADC_threshold>

  FIXED mode uses FIXED_THRESHOLD.
  WEB mode uses the threshold sent by the hardware monitor page.
  ADC counts are relative readings, NOT calibrated dB/SPL.
*/
#include <string.h>
#include <stdlib.h>

const byte MIC_PIN = A0;
const unsigned int SAMPLE_COUNT = 180;
const unsigned int SAMPLE_GAP_US = 60;
const float ATTACK_TIME_MS = 70.0;
const float RELEASE_TIME_MS = 650.0;
const int FIXED_THRESHOLD = 50;
const int HYSTERESIS = 6;

float filteredLevel = 0.0;
bool filterInitialized = false;
unsigned long previousSampleTime = 0;
bool webMode = false;
bool noiseDetected = false;
int websiteThreshold = 50;
char commandBuffer[32];
byte commandIndex = 0;

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char incoming = (char)Serial.read();
    if (incoming == '\n' || incoming == '\r') {
      if (commandIndex > 0) {
        commandBuffer[commandIndex] = '\0';
        if (strcmp(commandBuffer, "MODE,FIXED") == 0) {
          webMode = false;
          noiseDetected = false;
        } else if (strcmp(commandBuffer, "MODE,WEB") == 0) {
          webMode = true;
          noiseDetected = false;
        } else if (strncmp(commandBuffer, "TH,", 3) == 0) {
          const int value = atoi(commandBuffer + 3);
          if (value >= 1 && value <= 1023) websiteThreshold = value;
        }
        commandIndex = 0;
      }
    } else if (commandIndex < sizeof(commandBuffer) - 1) {
      commandBuffer[commandIndex++] = incoming;
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(MIC_PIN, INPUT);
}

void loop() {
  readSerialCommands();
  int signalMin = 1023, signalMax = 0;
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
    const float timeConstant = ((float)peakToPeak > filteredLevel)
      ? ATTACK_TIME_MS : RELEASE_TIME_MS;
    const float alpha = elapsedMs / (timeConstant + elapsedMs);
    filteredLevel += ((float)peakToPeak - filteredLevel) * alpha;
  }

  const int activeThreshold = webMode ? websiteThreshold : FIXED_THRESHOLD;
  if (!noiseDetected && filteredLevel >= activeThreshold) {
    noiseDetected = true;
  } else if (noiseDetected && filteredLevel < (activeThreshold - HYSTERESIS)) {
    noiseDetected = false;
  }

  Serial.print(F("SCI,"));
  Serial.println((int)(filteredLevel + 0.5f));
  Serial.print(F("STATE,"));
  Serial.println(noiseDetected ? 1 : 0);
  delay(8);
}

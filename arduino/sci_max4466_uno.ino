/*
  Silent Classroom Indicator - Arduino UNO + MAX4466
  Wiring:
    MAX4466 VCC -> Arduino 5V
    MAX4466 GND -> Arduino GND
    MAX4466 OUT -> Arduino A0

  Serial protocol (115200 baud):
    SCI,<peak_to_peak_ADC_counts>

  The browser converts the peak-to-peak envelope into a relative percentage.
  This is NOT a calibrated dB meter. No physical LEDs or buzzer are driven
  by this starter firmware; the current output indicators are in the website.
*/

const byte MIC_PIN = A0;
const unsigned int SAMPLE_COUNT = 180;
const unsigned int SAMPLE_GAP_US = 80;

void setup() {
  Serial.begin(115200);
  pinMode(MIC_PIN, INPUT);
}

void loop() {
  int signalMin = 1023;
  int signalMax = 0;

  for (unsigned int i = 0; i < SAMPLE_COUNT; i++) {
    int sampleValue = analogRead(MIC_PIN);

    if (sampleValue < signalMin) signalMin = sampleValue;
    if (sampleValue > signalMax) signalMax = sampleValue;

    delayMicroseconds(SAMPLE_GAP_US);
  }

  int peakToPeak = signalMax - signalMin;

  Serial.print(F("SCI,"));
  Serial.println(peakToPeak);

  // A small pause keeps the serial stream readable and stable.
  delay(8);
}

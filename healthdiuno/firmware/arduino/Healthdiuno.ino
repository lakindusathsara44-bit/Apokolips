/*
 * Healthdiuno — Arduino core serial diagnostic endpoint
 * Target: AVR-based Arduino boards (UNO / Nano / Mega / Leonardo families)
 * Serial protocol: newline-delimited JSON, 115200 baud
 */
#include <Arduino.h>

static String inputLine;

static void sendHello() {
  Serial.print(F("{\"type\":\"hello\",\"board\":\""));
#ifdef ARDUINO_BOARD
  Serial.print(ARDUINO_BOARD);
#else
  Serial.print(F("Arduino board"));
#endif
  Serial.print(F("\",\"mcu\":\""));
#if defined(__AVR_ATmega328P__)
  Serial.print(F("ATmega328P"));
#elif defined(__AVR_ATmega2560__)
  Serial.print(F("ATmega2560"));
#elif defined(__AVR_ATmega32U4__)
  Serial.print(F("ATmega32U4"));
#elif defined(__AVR__)
  Serial.print(F("AVR"));
#else
  Serial.print(F("Arduino-compatible MCU"));
#endif
  Serial.println(F("\",\"firmware\":\"Healthdiuno\",\"protocol\":1}"));
}

static void sendTest(const __FlashStringHelper *name, const __FlashStringHelper *status, const __FlashStringHelper *details) {
  Serial.print(F("{\"type\":\"test\",\"test\":\""));
  Serial.print(name);
  Serial.print(F("\",\"status\":\""));
  Serial.print(status);
  Serial.print(F("\",\"details\":\""));
  Serial.print(details);
  Serial.println(F("\"}"));
}

static void runScan() {
  sendTest(F("Microcontroller identity"), F("PASS"), F("Diagnostic firmware is running"));
  sendTest(F("Digital I/O pins"), F("INFO"), F("Pin loopback test profile required"));
  sendTest(F("Analog input channels"), F("INFO"), F("Board ADC profile required"));
  sendTest(F("PWM outputs"), F("INFO"), F("PWM output fixture profile required"));
  sendTest(F("Power measurements"), F("INFO"), F("External voltage measurement profile required"));
  sendTest(F("UART communication"), F("PASS"), F("USB serial command channel is responding"));
  sendTest(F("I²C interface"), F("INFO"), F("I2C peripheral test profile required"));
  sendTest(F("SPI interface"), F("INFO"), F("SPI peripheral test profile required"));
  sendTest(F("Reset & runtime"), F("PASS"), F("Firmware runtime is active"));
  sendTest(F("Clock & system status"), F("INFO"), F("Board-specific clock profile required"));
  Serial.println(F("{\"type\":\"scan_complete\"}"));
}

static void handleCommand(const String &line) {
  if (line.indexOf("\"cmd\":\"hello\"") >= 0) {
    sendHello();
  } else if (line.indexOf("\"cmd\":\"diagnostic_scan\"") >= 0) {
    runScan();
  } else {
    Serial.println(F("{\"type\":\"error\",\"message\":\"Unknown command\"}"));
  }
}

void setup() {
  Serial.begin(115200);
  const unsigned long started = millis();
  while (!Serial && millis() - started < 2500) {}
  sendHello();
}

void loop() {
  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\n') {
      inputLine.trim();
      if (inputLine.length()) handleCommand(inputLine);
      inputLine = "";
    } else if (c != '\r' && inputLine.length() < 256) {
      inputLine += c;
    }
  }
}

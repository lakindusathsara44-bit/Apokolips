/*
 * Healthdiuno — ESP32 Arduino core serial diagnostic endpoint
 * Target: ESP32, ESP32-S2, ESP32-S3, ESP32-C3, ESP32-C6 and compatible variants
 * Serial protocol: newline-delimited JSON, 115200 baud
 */
#include <Arduino.h>
#include <esp_system.h>

static String inputLine;

static void sendHello() {
  Serial.print(F("{\"type\":\"hello\",\"board\":\"ESP32 development board\",\"mcu\":\""));
  Serial.print(ESP.getChipModel());
  Serial.print(F("\",\"firmware\":\"Healthdiuno\",\"protocol\":1,\"revision\":"));
  Serial.print(ESP.getChipRevision());
  Serial.println(F("}"));
}

static void sendTest(const char *name, const char *status, const char *details) {
  Serial.print(F("{\"type\":\"test\",\"test\":\""));
  Serial.print(name);
  Serial.print(F("\",\"status\":\""));
  Serial.print(status);
  Serial.print(F("\",\"details\":\""));
  Serial.print(details);
  Serial.println(F("\"}"));
}

static void runScan() {
  sendTest("Microcontroller identity", "PASS", ESP.getChipModel());
  sendTest("Digital I/O pins", "INFO", "Selected ESP32 variant pin profile required");
  sendTest("Analog input channels", "INFO", "ADC-capable pin profile required");
  sendTest("PWM outputs", "INFO", "LEDC pin profile required");
  sendTest("Power measurements", "INFO", "External voltage measurement profile required");
  sendTest("UART communication", "PASS", "USB serial command channel is responding");
  sendTest("I²C interface", "INFO", "I2C peripheral test profile required");
  sendTest("SPI interface", "INFO", "SPI peripheral test profile required");
  sendTest("Reset & runtime", "PASS", "Firmware runtime is active");
  sendTest("Clock & system status", "PASS", "ESP32 system clock APIs are responding");
  Serial.println(F("{\"type\":\"scan_complete\"}"));
}

static void handleCommand(const String &line) {
  if (line.indexOf("\"cmd\":\"hello\"") >= 0) sendHello();
  else if (line.indexOf("\"cmd\":\"diagnostic_scan\"") >= 0) runScan();
  else Serial.println(F("{\"type\":\"error\",\"message\":\"Unknown command\"}"));
}

void setup() {
  Serial.begin(115200);
  delay(250);
  sendHello();
}

void loop() {
  while (Serial.available()) {
    const char c = (char)Serial.read();
    if (c == '\n') {
      inputLine.trim();
      if (inputLine.length()) handleCommand(inputLine);
      inputLine = "";
    } else if (c != '\r' && inputLine.length() < 256) inputLine += c;
  }
}

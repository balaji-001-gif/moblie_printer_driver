/**
 * Web Bluetooth Thermal Printer Driver
 * Supports: Xprinter, Rongta, iDPRT, Bixolon, generic ESC/POS BT printers
 * mobile_printer_driver/public/js/bluetooth_printer.js
 *
 * Requirements:
 *  - Chrome on Android (version 56+) / Chrome on Desktop
 *  - ERPNext site must be served over HTTPS
 *
 * KEY FIX: ESC/POS thermal printers use BLE "write without response" (like UDP).
 * Using writeValue() waits for ACK that never comes → silent failure.
 * Must use writeValueWithoutResponse() for actual printing.
 */

(function (global) {
    "use strict";

    // Common Bluetooth Service UUIDs for thermal printers
    const PRINTER_SERVICE_UUIDS = [
        "000018f0-0000-1000-8000-00805f9b34fb", // Generic Serial / most thermal printers
        "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Xprinter / iDPRT
        "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip BM78
        "00001101-0000-1000-8000-00805f9b34fb", // SPP
        "0000ff00-0000-1000-8000-00805f9b34fb", // Common generic
        "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 module
    ];

    class BluetoothPrinter {
        constructor() {
            this.device         = null;
            this.server         = null;
            this.characteristic = null;
            this.connected      = false;
            this.useWriteWR     = true; // prefer writeWithoutResponse
        }

        isSupported() {
            return !!(navigator.bluetooth);
        }

        // ----------------------------------------------------------------
        // Connect to Bluetooth printer
        // ----------------------------------------------------------------
        async connect() {
            if (!this.isSupported()) {
                throw new Error(
                    "Web Bluetooth is not supported. Please use Chrome on Android."
                );
            }

            try {
                console.log("[MPD-BT] Requesting Bluetooth device...");

                // Try filtered scan first; fall back to show all devices
                try {
                    this.device = await navigator.bluetooth.requestDevice({
                        filters: PRINTER_SERVICE_UUIDS.map(uuid => ({ services: [uuid] })),
                        optionalServices: PRINTER_SERVICE_UUIDS,
                    });
                } catch (filterErr) {
                    console.warn("[MPD-BT] Filtered scan failed, trying acceptAllDevices...", filterErr);
                    this.device = await navigator.bluetooth.requestDevice({
                        acceptAllDevices: true,
                        optionalServices: PRINTER_SERVICE_UUIDS,
                    });
                }

                console.log("[MPD-BT] Device selected:", this.device.name);

                this.server = await this.device.gatt.connect();
                console.log("[MPD-BT] GATT connected");

                this.characteristic = await this._findWritableCharacteristic();
                console.log("[MPD-BT] Characteristic found:", this.characteristic.uuid,
                    "| writeWR:", this.characteristic.properties.writeWithoutResponse,
                    "| write:", this.characteristic.properties.write);

                this.connected = true;
                localStorage.setItem("mpd_bt_device", this.device.name || "Thermal Printer");

                this.device.addEventListener("gattserverdisconnected", () => {
                    this.connected = false;
                    console.warn("[MPD-BT] Printer disconnected");
                    if (window.MobilePrinterUI) window.MobilePrinterUI.updateStatus("disconnected");
                });

                return this.device.name;
            } catch (err) {
                this.connected = false;
                console.error("[MPD-BT] Connect error:", err);
                throw err;
            }
        }

        // ----------------------------------------------------------------
        // Send ESC/POS bytes to the printer
        // ----------------------------------------------------------------
        async print(uint8Array) {
            if (!this.connected || !this.characteristic) {
                throw new Error("Printer not connected. Please connect first.");
            }

            console.log("[MPD-BT] Printing", uint8Array.length, "bytes...");

            // Most thermal printers use writeWithoutResponse (fire-and-forget).
            // writeValue() requires an ACK that never comes → silent failure.
            const supportsWWR = this.characteristic.properties.writeWithoutResponse;
            const supportsW   = this.characteristic.properties.write;

            // Use smaller chunks for BLE reliability
            const CHUNK_SIZE = 100;
            let sent = 0;

            for (let offset = 0; offset < uint8Array.length; offset += CHUNK_SIZE) {
                const chunk = uint8Array.slice(offset, offset + CHUNK_SIZE);

                if (supportsWWR) {
                    // ✅ Correct method for thermal printers – no ACK needed
                    await this.characteristic.writeValueWithoutResponse(chunk);
                } else if (supportsW) {
                    // Fallback: writeWithResponse (slower but may work on some models)
                    await this.characteristic.writeValue(chunk);
                } else {
                    throw new Error("Characteristic does not support writing.");
                }

                sent += chunk.length;
                // Small pacing delay to avoid BLE buffer overflow
                await this._delay(20);
            }

            console.log("[MPD-BT] Print complete. Bytes sent:", sent);
        }

        // ----------------------------------------------------------------
        // Disconnect
        // ----------------------------------------------------------------
        async disconnect() {
            if (this.device && this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
            this.connected      = false;
            this.characteristic = null;
        }

        // ----------------------------------------------------------------
        // Scan all services/characteristics for a writable one
        // Prioritises writeWithoutResponse (what thermal printers use)
        // ----------------------------------------------------------------
        async _findWritableCharacteristic() {
            let fallbackChar = null;

            // First pass: walk all services and find characteristics
            let services = [];
            try {
                services = await this.server.getPrimaryServices();
                console.log("[MPD-BT] Found", services.length, "services");
            } catch (e) {
                console.warn("[MPD-BT] getPrimaryServices failed:", e.message);
            }

            for (const service of services) {
                let chars = [];
                try {
                    chars = await service.getCharacteristics();
                } catch (e) { continue; }

                for (const char of chars) {
                    const wwr = char.properties.writeWithoutResponse;
                    const w   = char.properties.write;
                    console.log("[MPD-BT]  char:", char.uuid, "| writeWR:", wwr, "| write:", w);

                    if (wwr) return char;  // Best: writeWithoutResponse
                    if (w && !fallbackChar) fallbackChar = char; // Keep as fallback
                }
            }

            if (fallbackChar) {
                console.warn("[MPD-BT] Using write-with-response char as fallback");
                return fallbackChar;
            }

            // Second pass: try known service UUIDs directly
            for (const svcUuid of PRINTER_SERVICE_UUIDS) {
                try {
                    const service = await this.server.getPrimaryService(svcUuid);
                    const chars   = await service.getCharacteristics();
                    for (const char of chars) {
                        if (char.properties.writeWithoutResponse || char.properties.write) {
                            return char;
                        }
                    }
                } catch (e) { /* skip */ }
            }

            throw new Error(
                "No writable characteristic found. Open Chrome DevTools console and check [MPD-BT] logs."
            );
        }

        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    global.BluetoothPrinter = BluetoothPrinter;

})(window);

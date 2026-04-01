/**
 * Web Bluetooth Thermal Printer Driver
 * Supports: Xprinter, Rongta, iDPRT, Bixolon, Nordic UART, generic ESC/POS BT printers
 * mobile_printer_driver/public/js/bluetooth_printer.js
 *
 * Requirements:
 *  - Chrome on Android (version 56+)
 *  - ERPNext site must be served over HTTPS
 */

(function (global) {
    "use strict";

    // ALL known BLE service UUIDs used by thermal printers
    // Must be listed here for Web Bluetooth to grant access
    const PRINTER_SERVICE_UUIDS = [
        "000018f0-0000-1000-8000-00805f9b34fb", // Generic Serial (Xprinter, most common)
        "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Xprinter / iDPRT explicit UUID
        "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip BM78
        "00001101-0000-1000-8000-00805f9b34fb", // Classic SPP
        "0000ff00-0000-1000-8000-00805f9b34fb", // Common generic (Rongta, ZJ)
        "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 BLE module
        "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART Service (very common on cheap printers)
        "00001800-0000-1000-8000-00805f9b34fb", // Generic Access
        "00001801-0000-1000-8000-00805f9b34fb", // Generic Attribute
        "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
    ];

    class BluetoothPrinter {
        constructor() {
            this.device         = null;
            this.server         = null;
            this.characteristic = null;
            this.connected      = false;
        }

        isSupported() {
            return !!(navigator.bluetooth);
        }

        // ----------------------------------------------------------------
        // Connect: show BT picker and find writable characteristic
        // ----------------------------------------------------------------
        async connect() {
            if (!this.isSupported()) {
                throw new Error("Web Bluetooth not supported. Use Chrome on Android.");
            }

            console.log("[MPD-BT] Requesting Bluetooth device...");

            // Single requestDevice call – browsers allow only ONE per user gesture
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: PRINTER_SERVICE_UUIDS,
            });

            console.log("[MPD-BT] Device selected:", this.device.name);
            await this._connectGatt();
            return this.device.name;
        }

        // ----------------------------------------------------------------
        // Internal: establish GATT connection and find characteristic
        // ----------------------------------------------------------------
        async _connectGatt() {
            this.server         = await this.device.gatt.connect();
            this.characteristic = await this._findWritableCharacteristic();
            this.connected      = true;

            console.log("[MPD-BT] Ready. char:", this.characteristic.uuid,
                "| writeWR:", this.characteristic.properties.writeWithoutResponse,
                "| write:", this.characteristic.properties.write);

            localStorage.setItem("mpd_bt_device", this.device.name || "Thermal Printer");

            this.device.addEventListener("gattserverdisconnected", () => {
                this.connected = false;
                console.warn("[MPD-BT] GATT disconnected");
                if (window.MobilePrinterUI) window.MobilePrinterUI.updateStatus("disconnected");
            });
        }

        // ----------------------------------------------------------------
        // Print: auto-reconnect if GATT dropped, then stream ESC/POS bytes
        // ----------------------------------------------------------------
        async print(uint8Array) {
            if (!this.device) {
                throw new Error("No printer device. Please connect first.");
            }

            // Auto-reconnect if GATT dropped (very common on Android)
            if (!this.device.gatt.connected) {
                console.warn("[MPD-BT] GATT was disconnected. Reconnecting...");
                try {
                    await this._connectGatt();
                    console.log("[MPD-BT] Reconnected successfully.");
                } catch (e) {
                    this.connected = false;
                    throw new Error("Printer disconnected. Please tap 'Bluetooth' to reconnect.");
                }
            }

            const supportsWWR = this.characteristic.properties.writeWithoutResponse;
            const supportsW   = this.characteristic.properties.write;

            if (!supportsWWR && !supportsW) {
                throw new Error("Characteristic does not support writing. Check [MPD-BT] console logs.");
            }

            console.log("[MPD-BT] Printing", uint8Array.length, "bytes via",
                supportsWWR ? "writeWithoutResponse" : "writeWithResponse");

            // Send in 100-byte chunks with pacing (BLE buffer limit)
            const CHUNK_SIZE = 100;
            let sent = 0;

            for (let offset = 0; offset < uint8Array.length; offset += CHUNK_SIZE) {
                const chunk = uint8Array.slice(offset, offset + CHUNK_SIZE);

                try {
                    if (supportsWWR) {
                        await this.characteristic.writeValueWithoutResponse(chunk);
                    } else {
                        await this.characteristic.writeValue(chunk);
                    }
                } catch (chunkErr) {
                    console.error("[MPD-BT] Chunk write error at offset", offset, chunkErr);
                    throw new Error("Print failed mid-way: " + chunkErr.message +
                        ". Sent " + sent + "/" + uint8Array.length + " bytes.");
                }

                sent += chunk.length;
                await this._delay(30); // pacing to avoid BLE overflow
            }

            console.log("[MPD-BT] ✅ Print complete. Bytes sent:", sent);
        }

        async disconnect() {
            if (this.device && this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
            this.connected      = false;
            this.characteristic = null;
        }

        // ----------------------------------------------------------------
        // Find the best writable characteristic on the connected device
        // Walks ALL services; prioritises writeWithoutResponse
        // ----------------------------------------------------------------
        async _findWritableCharacteristic() {
            let wwrChar   = null;  // best: write-without-response
            let writeChar = null;  // fallback: write-with-response

            // Walk all primary services
            let services = [];
            try {
                services = await this.server.getPrimaryServices();
                console.log("[MPD-BT] Services found:", services.length);
            } catch (e) {
                console.warn("[MPD-BT] getPrimaryServices error:", e.message);
            }

            for (const service of services) {
                let chars = [];
                try { chars = await service.getCharacteristics(); } catch (e) { continue; }

                for (const char of chars) {
                    const wwr = char.properties.writeWithoutResponse;
                    const w   = char.properties.write;
                    console.log("[MPD-BT]  svc:", service.uuid,
                        "char:", char.uuid, "| wwr:", wwr, "| w:", w);

                    if (wwr && !wwrChar)   wwrChar   = char;
                    if (w   && !writeChar) writeChar = char;
                }
            }

            if (wwrChar) {
                console.log("[MPD-BT] Using writeWithoutResponse characteristic.");
                return wwrChar;
            }
            if (writeChar) {
                console.log("[MPD-BT] Using writeWithResponse characteristic (fallback).");
                return writeChar;
            }

            // Last resort: try well-known Nordic UART TX characteristic
            const nordicUART = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
            const nordicTX   = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
            try {
                const svc  = await this.server.getPrimaryService(nordicUART);
                const char = await svc.getCharacteristic(nordicTX);
                console.log("[MPD-BT] Using Nordic UART TX characteristic.");
                return char;
            } catch (e) { /* not a Nordic device */ }

            throw new Error(
                "No writable BT characteristic found on this printer.\n" +
                "Open Chrome DevTools → Console → look for [MPD-BT] service/char UUIDs\n" +
                "and share them to get model-specific support."
            );
        }

        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    global.BluetoothPrinter = BluetoothPrinter;

})(window);

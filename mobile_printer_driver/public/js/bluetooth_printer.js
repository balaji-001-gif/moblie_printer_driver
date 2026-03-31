/**
 * Web Bluetooth Thermal Printer Driver
 * Supports: Xprinter, Rongta, iDPRT, Bixolon, generic ESC/POS BT printers
 * mobile_printer_driver/public/js/bluetooth_printer.js
 *
 * Requirements:
 *  - Chrome on Android (version 56+) / Chrome on Desktop
 *  - ERPNext site must be served over HTTPS
 */

(function (global) {
    "use strict";

    // Common Bluetooth Service UUIDs for thermal printers
    const PRINTER_SERVICE_UUIDS = [
        "000018f0-0000-1000-8000-00805f9b34fb", // Generic Serial (most common)
        "00001101-0000-1000-8000-00805f9b34fb", // SPP - Serial Port Profile
        "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Xprinter / iDPRT
        "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip BM78
    ];

    // Common Bluetooth Characteristic UUIDs for write
    const PRINTER_CHAR_UUIDS = [
        "00002af1-0000-1000-8000-00805f9b34fb",
        "00002a06-0000-1000-8000-00805f9b34fb",
        "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
        "49535343-8841-43f4-a8d4-ecbe34729bb3",
    ];

    class BluetoothPrinter {
        constructor() {
            this.device      = null;
            this.server      = null;
            this.characteristic = null;
            this.connected   = false;
        }

        isSupported() {
            return !!(navigator.bluetooth);
        }

        async connect() {
            if (!this.isSupported()) {
                throw new Error("Web Bluetooth is not supported in this browser. Use Chrome on Android.");
            }

            try {
                // Try each known service UUID, fallback to acceptAllDevices
                let deviceOptions;
                try {
                    deviceOptions = {
                        filters: PRINTER_SERVICE_UUIDS.map(uuid => ({ services: [uuid] })),
                        optionalServices: PRINTER_SERVICE_UUIDS,
                    };
                    this.device = await navigator.bluetooth.requestDevice(deviceOptions);
                } catch (e) {
                    // Wider scan if filters don't match
                    this.device = await navigator.bluetooth.requestDevice({
                        acceptAllDevices: true,
                        optionalServices: PRINTER_SERVICE_UUIDS,
                    });
                }

                this.server = await this.device.gatt.connect();

                // Try to find a writable characteristic
                this.characteristic = await this._findWritableCharacteristic();

                this.connected = true;

                // Listen for disconnect
                this.device.addEventListener("gattserverdisconnected", () => {
                    this.connected = false;
                    this._onDisconnect();
                });

                // Save device name
                localStorage.setItem("mpd_bt_device", this.device.name || "Thermal Printer");

                return this.device.name;
            } catch (err) {
                this.connected = false;
                throw err;
            }
        }

        async print(uint8Array) {
            if (!this.connected || !this.characteristic) {
                throw new Error("Printer not connected. Please connect first.");
            }

            // Send in chunks of 512 bytes (BLE MTU limit)
            const CHUNK = 512;
            for (let offset = 0; offset < uint8Array.length; offset += CHUNK) {
                const chunk = uint8Array.slice(offset, offset + CHUNK);
                await this.characteristic.writeValue(chunk);
                await this._delay(50); // Small delay between chunks
            }
        }

        async disconnect() {
            if (this.device && this.device.gatt.connected) {
                this.device.gatt.disconnect();
            }
            this.connected = false;
            this.characteristic = null;
        }

        async _findWritableCharacteristic() {
            // Try each service/characteristic combination
            const services = await this.server.getPrimaryServices();
            for (const service of services) {
                try {
                    const chars = await service.getCharacteristics();
                    for (const char of chars) {
                        if (char.properties.write || char.properties.writeWithoutResponse) {
                            return char;
                        }
                    }
                } catch (e) { /* skip inaccessible service */ }
            }

            // Try known characteristic UUIDs directly
            for (const svcUuid of PRINTER_SERVICE_UUIDS) {
                try {
                    const service = await this.server.getPrimaryService(svcUuid);
                    for (const charUuid of PRINTER_CHAR_UUIDS) {
                        try {
                            const char = await service.getCharacteristic(charUuid);
                            if (char.properties.write || char.properties.writeWithoutResponse) {
                                return char;
                            }
                        } catch (e) { /* try next */ }
                    }
                } catch (e) { /* try next service */ }
            }

            throw new Error("No writable characteristic found on this Bluetooth device.");
        }

        _onDisconnect() {
            console.warn("[MPD] Bluetooth printer disconnected.");
            if (window.MobilePrinterUI) {
                window.MobilePrinterUI.updateStatus("disconnected");
            }
        }

        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    global.BluetoothPrinter = BluetoothPrinter;

})(window);

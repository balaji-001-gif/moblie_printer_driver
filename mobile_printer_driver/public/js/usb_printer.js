/**
 * WebUSB Thermal Printer Driver (USB OTG on Android)
 * Compatible with Xprinter, Epson TM series, Bixolon, Star, generic ESC/POS
 * mobile_printer_driver/public/js/usb_printer.js
 *
 * Requirements:
 *  - Chrome on Android with USB OTG cable
 *  - Chrome on Desktop with USB cable
 *  - ERPNext site must be served over HTTPS
 */

(function (global) {
    "use strict";

    // Known thermal printer USB Vendor IDs (for filtered scan)
    const PRINTER_VENDOR_IDS = [
        { vendorId: 0x04b8 }, // Epson
        { vendorId: 0x0519 }, // Star Micronics
        { vendorId: 0x0dd4 }, // Custom Engineering
        { vendorId: 0x1504 }, // Xprinter / ZJ
        { vendorId: 0x28e9 }, // Xprinter (alt)
        { vendorId: 0x0483 }, // STMicroelectronics (generic)
        { vendorId: 0x154f }, // SNBC
        { vendorId: 0x0fe6 }, // ICS Advent (Prolific)
    ];

    class USBPrinter {
        constructor() {
            this.device     = null;
            this.endpoint   = null;
            this.connected  = false;
            this.interface  = 0;
        }

        isSupported() {
            return !!(navigator.usb);
        }

        async connect() {
            if (!this.isSupported()) {
                throw new Error("WebUSB is not supported in this browser. Use Chrome with a USB OTG cable.");
            }

            try {
                // Try filtered list first, then accept all
                try {
                    this.device = await navigator.usb.requestDevice({ filters: PRINTER_VENDOR_IDS });
                } catch (e) {
                    this.device = await navigator.usb.requestDevice({ filters: [] });
                }

                await this.device.open();

                // Select configuration #1 (standard for most printers)
                if (this.device.configuration === null) {
                    await this.device.selectConfiguration(1);
                }

                // Find the right interface and endpoint
                const { iface, endpointNum } = this._findInterface();
                this.interface = iface;
                this.endpoint  = endpointNum;

                await this.device.claimInterface(this.interface);

                this.connected = true;

                const name = this.device.productName || `USB Device (0x${this.device.vendorId.toString(16)})`;
                localStorage.setItem("mpd_usb_device", name);

                return name;
            } catch (err) {
                this.connected = false;
                throw err;
            }
        }

        async print(uint8Array) {
            if (!this.connected || !this.device) {
                throw new Error("USB Printer not connected. Please connect first.");
            }

            // Send in chunks of 64 bytes (USB full-speed bulk endpoint)
            const CHUNK = 64;
            for (let offset = 0; offset < uint8Array.length; offset += CHUNK) {
                const chunk = uint8Array.slice(offset, offset + CHUNK);
                await this.device.transferOut(this.endpoint, chunk);
                await this._delay(10);
            }
        }

        async disconnect() {
            if (this.device) {
                try {
                    await this.device.releaseInterface(this.interface);
                    await this.device.close();
                } catch (e) { /* ignore */ }
            }
            this.connected = false;
            this.device    = null;
        }

        _findInterface() {
            // Walk through all interfaces/endpoints to find a BULK OUT endpoint
            for (const iface of this.device.configuration.interfaces) {
                for (const alt of iface.alternates) {
                    for (const ep of alt.endpoints) {
                        if (ep.direction === "out" && ep.type === "bulk") {
                            return { iface: iface.interfaceNumber, endpointNum: ep.endpointNumber };
                        }
                    }
                }
            }
            // Fallback to endpoint 1
            return { iface: 0, endpointNum: 1 };
        }

        _delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    global.USBPrinter = USBPrinter;

})(window);

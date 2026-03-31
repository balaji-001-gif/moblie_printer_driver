/**
 * ESC/POS Command Encoder
 * Generates byte arrays for thermal printers (58mm / 80mm paper)
 * mobile_printer_driver/public/js/escpos.js
 */

(function (global) {
    "use strict";

    const ESC = 0x1B;
    const GS  = 0x1D;
    const LF  = 0x0A;
    const CR  = 0x0D;

    class EscPos {
        constructor(paperWidth = 32) {
            // 58mm ≈ 32 chars per line, 80mm ≈ 48 chars per line
            this.paperWidth = paperWidth;
            this.buffer = [];
        }

        /** Reset printer */
        init() {
            this._push(ESC, 0x40);
            return this;
        }

        /** Set bold on/off */
        bold(on = true) {
            this._push(ESC, 0x45, on ? 1 : 0);
            return this;
        }

        /** Set underline on/off */
        underline(on = true) {
            this._push(ESC, 0x2D, on ? 1 : 0);
            return this;
        }

        /** Set font size: normal (1) or double (2) */
        size(scale = 1) {
            const s = (scale - 1) * 0x11;
            this._push(GS, 0x21, s);
            return this;
        }

        /** Align: 'left' | 'center' | 'right' */
        align(type = "left") {
            const map = { left: 0, center: 1, right: 2 };
            this._push(ESC, 0x61, map[type] || 0);
            return this;
        }

        /** Add a line of text */
        text(str = "") {
            const encoded = this._encode(str);
            this.buffer.push(...encoded, LF);
            return this;
        }

        /** Add text without newline */
        raw(str = "") {
            this.buffer.push(...this._encode(str));
            return this;
        }

        /** Add a dashed divider line */
        divider(char = "-") {
            return this.text(char.repeat(this.paperWidth));
        }

        /** Add N blank lines */
        feed(lines = 1) {
            for (let i = 0; i < lines; i++) this.buffer.push(LF);
            return this;
        }

        /** Full paper cut */
        cut() {
            this._push(GS, 0x56, 0x00);
            return this;
        }

        /** Partial cut */
        partialCut() {
            this._push(GS, 0x56, 0x01);
            return this;
        }

        /**
         * Two-column row (left + right aligned within paper width)
         * e.g. row("Item Name", "100.00")
         */
        row(left = "", right = "") {
            const space = this.paperWidth - left.length - right.length;
            const line = left + " ".repeat(Math.max(space, 1)) + right;
            return this.text(line.substring(0, this.paperWidth));
        }

        /** Return final Uint8Array */
        build() {
            return new Uint8Array(this.buffer);
        }

        /** Encode string to byte array (Latin-1 safe) */
        _encode(str) {
            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i);
                bytes.push(code < 256 ? code : 0x3F); // '?' for unsupported chars
            }
            return bytes;
        }

        _push(...bytes) {
            this.buffer.push(...bytes);
        }
    }

    global.EscPos = EscPos;

})(window);

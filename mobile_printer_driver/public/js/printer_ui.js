/**
 * Mobile Printer UI Controller
 * Supports:
 *  1. 📱 System Print  – window.print() via Android system dialog → works with ANY paired BT printer (Classic + BLE)
 *  2. 📶 BLE Bluetooth – Web Bluetooth writeValueWithoutResponse (BLE-only printers)
 *  3. 🔌 USB OTG       – WebUSB (USB cable from phone to printer)
 *
 * mobile_printer_driver/public/js/printer_ui.js
 */

(function (global) {
    "use strict";

    const SUPPORTED_DOCTYPES = [
        "Sales Invoice", "POS Invoice", "Delivery Note",
        "Sales Order", "Purchase Order", "Quotation",
        "Payment Entry", "Stock Entry",
    ];

    let btPrinter  = null;
    let usbPrinter = null;
    let activeConn = null; // 'bluetooth' | 'usb' | null
    let paperWidth = 32;   // 32 chars = 58mm, 48 chars = 80mm

    // ----------------------------------------------------------------
    // Bootstrap
    // ----------------------------------------------------------------
    function init() {
        if (typeof frappe === "undefined") return;
        btPrinter  = new BluetoothPrinter();
        usbPrinter = new USBPrinter();

        const savedWidth = localStorage.getItem("mpd_paper_width");
        if (savedWidth) paperWidth = parseInt(savedWidth, 10);

        frappe.router.on("change", () => setTimeout(injectPrintButton, 500));
        setTimeout(injectPrintButton, 1000);
    }

    // ----------------------------------------------------------------
    // Floating button
    // ----------------------------------------------------------------
    function injectPrintButton() {
        const existing = document.getElementById("mpd-float-btn");
        if (existing) existing.remove();

        if (!frappe.get_route) return;
        const route = frappe.get_route();
        if (!route || route[0] !== "Form" || !SUPPORTED_DOCTYPES.includes(route[1])) return;

        const form = frappe.ui.form.get_open_form && frappe.ui.form.get_open_form();
        if (form && form.is_new()) return;

        const btn = document.createElement("div");
        btn.id = "mpd-float-btn";
        btn.innerHTML = `<span class="mpd-icon">🖨</span><span class="mpd-label"> Print</span>`;
        btn.title = "Thermal Print";
        btn.addEventListener("click", openPrintModal);
        document.body.appendChild(btn);
    }

    // ----------------------------------------------------------------
    // Modal
    // ----------------------------------------------------------------
    function openPrintModal() {
        const existingModal = document.getElementById("mpd-modal-overlay");
        if (existingModal) existingModal.remove();

        const btName  = localStorage.getItem("mpd_bt_device")  || "Not Connected";
        const usbName = localStorage.getItem("mpd_usb_device") || "Not Connected";
        const connLabel = activeConn
            ? `Connected via ${activeConn === "bluetooth" ? "BLE Bluetooth 📶" : "USB 🔌"}`
            : "No BLE/USB connection";

        const overlay = document.createElement("div");
        overlay.id = "mpd-modal-overlay";
        overlay.innerHTML = `
            <div class="mpd-modal" id="mpd-modal">
                <div class="mpd-modal-header">
                    <span class="mpd-modal-title">🖨 Print Receipt</span>
                    <button class="mpd-close-btn" id="mpd-close">✕</button>
                </div>

                <!-- PRIMARY: System Print (works with ALL paired BT printers) -->
                <div class="mpd-section-title">📱 Recommended – Works with any paired Bluetooth printer</div>
                <button class="mpd-system-print-btn" id="mpd-system-print">
                    📱 System Print
                    <small>Opens Android print dialog → select your paired printer</small>
                </button>

                <div class="mpd-divider-label">── or use raw BLE / USB ──</div>

                <!-- Paper Width -->
                <div class="mpd-section-title">Paper Width</div>
                <div class="mpd-toggle-row">
                    <button class="mpd-toggle-btn ${paperWidth === 32 ? 'active' : ''}" data-width="32">58 mm</button>
                    <button class="mpd-toggle-btn ${paperWidth === 48 ? 'active' : ''}" data-width="48">80 mm</button>
                </div>

                <!-- BLE / USB Connection -->
                <div class="mpd-section-title">Raw ESC/POS Connection</div>
                <div class="mpd-status-bar" id="mpd-status-bar">
                    <span class="mpd-status-dot disconnected" id="mpd-status-dot"></span>
                    <span id="mpd-status-text">${connLabel}</span>
                </div>
                <div class="mpd-btn-row">
                    <button class="mpd-action-btn mpd-bt-btn" id="mpd-connect-bt">
                        📶 BLE Bluetooth
                        <small>${btName}</small>
                    </button>
                    <button class="mpd-action-btn mpd-usb-btn" id="mpd-connect-usb">
                        🔌 USB OTG
                        <small>${usbName}</small>
                    </button>
                </div>
                <button class="mpd-print-btn" id="mpd-do-print">🖨 ESC/POS Print Now</button>

                <div class="mpd-footer">
                    Mobile Printer Driver • ERPNext
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById("mpd-close").addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

        document.getElementById("mpd-system-print").addEventListener("click", doSystemPrint);
        document.getElementById("mpd-connect-bt").addEventListener("click", connectBluetooth);
        document.getElementById("mpd-connect-usb").addEventListener("click", connectUSB);
        document.getElementById("mpd-do-print").addEventListener("click", doPrint);

        overlay.querySelectorAll(".mpd-toggle-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                overlay.querySelectorAll(".mpd-toggle-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                paperWidth = parseInt(btn.dataset.width, 10);
                localStorage.setItem("mpd_paper_width", paperWidth);
            });
        });

        updateStatus(activeConn ? "connected" : "disconnected");
    }

    // ----------------------------------------------------------------
    // SYSTEM PRINT – works with Classic BT AND BLE AND WiFi printers
    // Uses Android's built-in print dialog via window.print()
    // ----------------------------------------------------------------
    async function doSystemPrint() {
        const sysBtn = document.getElementById("mpd-system-print");
        sysBtn.disabled = true;
        sysBtn.textContent = "⏳ Opening print dialog...";

        try {
            const form = frappe.ui.form.get_open_form && frappe.ui.form.get_open_form();
            if (!form) throw new Error("No document open.");

            const doc    = form.doc;
            const width  = paperWidth === 48 ? "80mm" : "58mm";

            // Build a clean thermal receipt HTML for printing
            const html = buildPrintHTML(doc, width);

            // Open in popup and trigger system print dialog
            const pw = window.open("", "_blank",
                "width=400,height=600,scrollbars=yes,resizable=yes");

            if (!pw) {
                // Popup blocked – fall back to iframe print
                const iframe = document.createElement("iframe");
                iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:0;height:0;";
                document.body.appendChild(iframe);
                iframe.contentDocument.write(html);
                iframe.contentDocument.close();
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                setTimeout(() => document.body.removeChild(iframe), 3000);
            } else {
                pw.document.write(html);
                pw.document.close();
                pw.focus();
                // Small delay for page to render before printing
                setTimeout(() => {
                    pw.print();
                    // Optional: close popup after printing on Android
                    // pw.close();
                }, 500);
            }

            document.getElementById("mpd-modal-overlay").remove();
            frappe.show_alert({ message: "✅ Print dialog opened!", indicator: "green" });

        } catch (err) {
            frappe.show_alert({ message: `❌ ${err.message}`, indicator: "red" });
        } finally {
            if (sysBtn) {
                sysBtn.disabled = false;
                sysBtn.innerHTML = "📱 System Print<small>Opens Android print dialog → select your paired printer</small>";
            }
        }
    }

    // ----------------------------------------------------------------
    // Build receipt HTML for window.print() – optimised for thermal
    // ----------------------------------------------------------------
    function buildPrintHTML(doc, width) {
        const co    = frappe.boot.sysdefaults?.company || doc.company || "";
        const addr  = frappe.boot.sysdefaults?.company_address || "";
        const date  = frappe.datetime.str_to_user(doc.posting_date || doc.transaction_date || "");
        const cust  = doc.customer_name || doc.supplier_name || "";

        let itemRows = "";
        (doc.items || []).forEach(item => {
            itemRows += `
                <tr>
                    <td colspan="2" style="padding-top:4px;font-size:11px;">${item.item_name || item.item_code}</td>
                </tr>
                <tr>
                    <td style="font-size:11px;color:#555;">${flt(item.qty,2)} x ${flt(item.rate,2)}</td>
                    <td style="text-align:right;font-size:11px;">${flt(item.amount,2)}</td>
                </tr>`;
        });

        let taxRows = "";
        (doc.taxes || []).forEach(tax => {
            taxRows += `<tr>
                <td style="font-size:11px;">${tax.description || "Tax"}</td>
                <td style="text-align:right;font-size:11px;">${flt(tax.tax_amount,2)}</td>
            </tr>`;
        });

        return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>${doc.name}</title>
<style>
  @page { margin: 0; size: ${width} auto; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Courier New', monospace; font-size:12px;
         width:${width}; padding:4mm 3mm; color:#000; }
  .center { text-align:center; }
  .bold   { font-weight:bold; }
  .hr     { border-top:1px dashed #000; margin:4px 0; }
  .total  { font-size:15px; font-weight:bold; }
  table   { width:100%; border-collapse:collapse; }
  td      { padding:1px 0; vertical-align:top; }
</style>
</head><body>
<div class="center bold" style="font-size:15px;">${co}</div>
${addr ? `<div class="center" style="font-size:10px;">${addr}</div>` : ""}
<div class="hr"></div>
<table>
  <tr><td>Invoice:</td><td style="text-align:right">${doc.name}</td></tr>
  <tr><td>Date:</td><td style="text-align:right">${date}</td></tr>
  ${cust ? `<tr><td>Customer:</td><td style="text-align:right">${cust}</td></tr>` : ""}
</table>
<div class="hr"></div>
<table>
  <tr><td class="bold">Item</td><td style="text-align:right" class="bold">Amt</td></tr>
  ${itemRows}
</table>
<div class="hr"></div>
<table>
  ${taxRows}
  ${doc.net_total ? `<tr><td>Net Total:</td><td style="text-align:right">${flt(doc.net_total,2)}</td></tr>` : ""}
  <tr>
    <td class="total">TOTAL</td>
    <td class="total" style="text-align:right">${flt(doc.rounded_total || doc.grand_total,2)}</td>
  </tr>
  ${doc.mode_of_payment ? `<tr><td>Payment:</td><td style="text-align:right">${doc.mode_of_payment}</td></tr>` : ""}
</table>
<div class="hr"></div>
<div class="center" style="font-size:10px;margin-top:4px;">
  Thank You For Your Business!<br>Please Come Again
</div>
<script>window.onafterprint = function(){ window.close(); }</script>
</body></html>`;
    }

    // ----------------------------------------------------------------
    // BLE Bluetooth Connection (BLE printers only)
    // ----------------------------------------------------------------
    async function connectBluetooth() {
        updateStatus("connecting");
        try {
            const name = await btPrinter.connect();
            activeConn = "bluetooth";
            updateStatus("connected");
            document.querySelector("#mpd-connect-bt small").textContent = name;
            frappe.show_alert({ message: `✅ BLE Connected: ${name}`, indicator: "green" });
        } catch (err) {
            updateStatus("disconnected");
            const msg = err.message.includes("Unsupported device")
                ? "❌ This printer uses Classic Bluetooth (not BLE). Use 📱 System Print instead!"
                : `❌ BLE Error: ${err.message}`;
            frappe.show_alert({ message: msg, indicator: "red" });
        }
    }

    // ----------------------------------------------------------------
    // USB Connection
    // ----------------------------------------------------------------
    async function connectUSB() {
        updateStatus("connecting");
        try {
            const name = await usbPrinter.connect();
            activeConn = "usb";
            updateStatus("connected");
            document.querySelector("#mpd-connect-usb small").textContent = name;
            frappe.show_alert({ message: `✅ USB Connected: ${name}`, indicator: "green" });
        } catch (err) {
            updateStatus("disconnected");
            frappe.show_alert({ message: `❌ USB Error: ${err.message}`, indicator: "red" });
        }
    }

    // ----------------------------------------------------------------
    // ESC/POS Raw Print (BLE or USB)
    // ----------------------------------------------------------------
    async function doPrint() {
        if (!activeConn) {
            frappe.show_alert({ message: "Please connect via BLE or USB first. Or use 📱 System Print.", indicator: "orange" });
            return;
        }

        const form = frappe.ui.form.get_open_form && frappe.ui.form.get_open_form();
        if (!form) {
            frappe.show_alert({ message: "No document open.", indicator: "red" });
            return;
        }

        const printBtn = document.getElementById("mpd-do-print");
        printBtn.textContent = "⏳ Printing...";
        printBtn.disabled = true;

        try {
            const bytes = buildEscPosDoc(form.doc);
            const printer = activeConn === "bluetooth" ? btPrinter : usbPrinter;
            await printer.print(bytes);
            frappe.show_alert({ message: "✅ Printed!", indicator: "green" });
            document.getElementById("mpd-modal-overlay").remove();
        } catch (err) {
            frappe.show_alert({ message: `❌ ${err.message}`, indicator: "red" });
        } finally {
            if (printBtn) { printBtn.textContent = "🖨 ESC/POS Print Now"; printBtn.disabled = false; }
        }
    }

    // ----------------------------------------------------------------
    // ESC/POS byte builder
    // ----------------------------------------------------------------
    function buildEscPosDoc(doc) {
        const ep = new EscPos(paperWidth);
        const div = "-".repeat(paperWidth);

        ep.init().align("center").bold(true).size(2)
          .text(frappe.boot.sysdefaults?.company || doc.company || "Company")
          .size(1).bold(false);

        if (frappe.boot.sysdefaults?.company_address)
            ep.text(frappe.boot.sysdefaults.company_address);

        const date = frappe.datetime.str_to_user(doc.posting_date || doc.transaction_date || "");
        ep.align("left").text(div)
          .row("Invoice:", doc.name || "")
          .row("Date:", date)
          .row("Customer:", (doc.customer_name || doc.supplier_name || "").substring(0, paperWidth - 10))
          .text(div);

        ep.bold(true).text("Item").row("Qty x Rate", "Amount").bold(false).text(div);

        (doc.items || []).forEach(item => {
            ep.text((item.item_name || item.item_code || "").substring(0, paperWidth));
            ep.row(`${flt(item.qty,2)} x ${flt(item.rate,2)}`, flt(item.amount,2).toString());
        });

        ep.text(div);
        (doc.taxes || []).forEach(t => ep.row(t.description || "Tax", flt(t.tax_amount,2).toString()));

        ep.bold(true).size(2)
          .row("TOTAL:", flt(doc.grand_total || doc.rounded_total || 0, 2).toString())
          .size(1).bold(false).text(div);

        if (doc.mode_of_payment) ep.row("Payment:", doc.mode_of_payment);
        if (doc.paid_amount)     ep.row("Paid:",    flt(doc.paid_amount,2).toString());

        ep.text(div).align("center")
          .text("Thank You for Your Business!")
          .text("Please Come Again")
          .feed(3).cut();

        return ep.build();
    }

    // ----------------------------------------------------------------
    // Status
    // ----------------------------------------------------------------
    function updateStatus(state) {
        const dot  = document.getElementById("mpd-status-dot");
        const text = document.getElementById("mpd-status-text");
        if (!dot || !text) return;
        dot.className = "mpd-status-dot " + state;
        text.textContent = {
            connected:    activeConn ? `Connected via ${activeConn === "bluetooth" ? "BLE 📶" : "USB 🔌"}` : "Connected",
            disconnected: "No BLE/USB connection",
            connecting:   "Connecting...",
        }[state] || state;
    }

    // ----------------------------------------------------------------
    // Form toolbar button
    // ----------------------------------------------------------------
    function addFormButton(frm) {
        if (!SUPPORTED_DOCTYPES.includes(frm.doctype)) return;
        frm.add_custom_button(__("🖨 Thermal Print"), openPrintModal);
    }

    SUPPORTED_DOCTYPES.forEach(doctype => {
        frappe.ui.form.on(doctype, {
            refresh(frm) { if (!frm.is_new()) addFormButton(frm); }
        });
    });

    function flt(val, precision = 2) {
        return parseFloat(val || 0).toFixed(precision);
    }

    global.MobilePrinterUI = { updateStatus, openPrintModal, init };

    if (document.readyState === "complete") {
        init();
    } else {
        window.addEventListener("load", init);
    }

})(window);

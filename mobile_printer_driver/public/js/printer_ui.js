/**
 * Mobile Printer UI Controller
 * Injects floating print button and modal into ERPNext pages
 * Works on: Sales Invoice, POS Invoice, Delivery Note, Purchase Order, Quotation
 * mobile_printer_driver/public/js/printer_ui.js
 */

(function (global) {
    "use strict";

    // Doctypes where the print button should appear
    const SUPPORTED_DOCTYPES = [
        "Sales Invoice",
        "POS Invoice",
        "Delivery Note",
        "Sales Order",
        "Purchase Order",
        "Quotation",
        "Payment Entry",
        "Stock Entry",
    ];

    let btPrinter  = null;
    let usbPrinter = null;
    let activeConn = null; // 'bluetooth' | 'usb' | null
    let paperWidth = 32;   // 32 chars = 58mm,  48 chars = 80mm

    // ----------------------------------------------------------------
    // Bootstrap – runs after Frappe is fully loaded
    // ----------------------------------------------------------------
    function init() {
        if (typeof frappe === "undefined") return;

        btPrinter  = new BluetoothPrinter();
        usbPrinter = new USBPrinter();

        // Load saved settings
        const savedWidth = localStorage.getItem("mpd_paper_width");
        if (savedWidth) paperWidth = parseInt(savedWidth, 10);

        // Hook into Frappe page changes
        frappe.router.on("change", () => {
            setTimeout(injectPrintButton, 500);
        });

        // Also inject on first load
        setTimeout(injectPrintButton, 1000);
    }

    // ----------------------------------------------------------------
    // Inject floating button into supported doctype pages
    // ----------------------------------------------------------------
    function injectPrintButton() {
        // Remove existing button first
        const existing = document.getElementById("mpd-float-btn");
        if (existing) existing.remove();

        if (!frappe.get_route) return;
        const route = frappe.get_route();

        // Only show on form views of supported doctypes
        if (!route || route[0] !== "Form" || !SUPPORTED_DOCTYPES.includes(route[1])) return;

        // Don't show on new unsaved docs
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
    // Print Modal
    // ----------------------------------------------------------------
    function openPrintModal() {
        const existingModal = document.getElementById("mpd-modal-overlay");
        if (existingModal) existingModal.remove();

        const btName  = localStorage.getItem("mpd_bt_device")  || "Not Connected";
        const usbName = localStorage.getItem("mpd_usb_device") || "Not Connected";
        const connIcon = activeConn ? "🟢" : "🔴";
        const connLabel = activeConn
            ? `Connected via ${activeConn === "bluetooth" ? "Bluetooth 📶" : "USB 🔌"}`
            : "Not Connected";

        const overlay = document.createElement("div");
        overlay.id = "mpd-modal-overlay";
        overlay.innerHTML = `
            <div class="mpd-modal" id="mpd-modal">
                <div class="mpd-modal-header">
                    <span class="mpd-modal-title">🖨 Thermal Printer</span>
                    <button class="mpd-close-btn" id="mpd-close">✕</button>
                </div>

                <div class="mpd-status-bar" id="mpd-status-bar">
                    <span class="mpd-status-dot" id="mpd-status-dot"></span>
                    <span id="mpd-status-text">${connLabel}</span>
                </div>

                <div class="mpd-section-title">Paper Width</div>
                <div class="mpd-toggle-row">
                    <button class="mpd-toggle-btn ${paperWidth === 32 ? 'active' : ''}" id="mpd-width-58" data-width="32">58 mm</button>
                    <button class="mpd-toggle-btn ${paperWidth === 48 ? 'active' : ''}" id="mpd-width-80" data-width="48">80 mm</button>
                </div>

                <div class="mpd-section-title">Connection</div>
                <div class="mpd-btn-row">
                    <button class="mpd-action-btn mpd-bt-btn" id="mpd-connect-bt">
                        📶 Bluetooth
                        <small>${btName}</small>
                    </button>
                    <button class="mpd-action-btn mpd-usb-btn" id="mpd-connect-usb">
                        🔌 USB OTG
                        <small>${usbName}</small>
                    </button>
                </div>

                <button class="mpd-print-btn" id="mpd-do-print">🖨 Print Now</button>

                <div class="mpd-footer">
                    Powered by Mobile Printer Driver • ERPNext
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Event listeners
        document.getElementById("mpd-close").addEventListener("click", () => overlay.remove());
        overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

        document.getElementById("mpd-connect-bt").addEventListener("click", connectBluetooth);
        document.getElementById("mpd-connect-usb").addEventListener("click", connectUSB);
        document.getElementById("mpd-do-print").addEventListener("click", doPrint);

        // Paper width toggles
        overlay.querySelectorAll(".mpd-toggle-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                overlay.querySelectorAll(".mpd-toggle-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                paperWidth = parseInt(btn.dataset.width, 10);
                localStorage.setItem("mpd_paper_width", paperWidth);
            });
        });

        // Reflect current connection state
        updateStatus(activeConn ? "connected" : "disconnected");
    }

    // ----------------------------------------------------------------
    // Connection Handlers
    // ----------------------------------------------------------------
    async function connectBluetooth() {
        updateStatus("connecting");
        try {
            const name = await btPrinter.connect();
            activeConn = "bluetooth";
            updateStatus("connected");
            document.querySelector("#mpd-connect-bt small").textContent = name;
            frappe.show_alert({ message: `✅ Bluetooth Connected: ${name}`, indicator: "green" });
        } catch (err) {
            updateStatus("disconnected");
            frappe.show_alert({ message: `❌ Bluetooth Error: ${err.message}`, indicator: "red" });
        }
    }

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
    // Print Handler
    // ----------------------------------------------------------------
    async function doPrint() {
        if (!activeConn) {
            frappe.show_alert({ message: "Please connect a printer first.", indicator: "orange" });
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
            frappe.show_alert({ message: "✅ Printed successfully!", indicator: "green" });
            document.getElementById("mpd-modal-overlay").remove();
        } catch (err) {
            frappe.show_alert({ message: `❌ Print Error: ${err.message}`, indicator: "red" });
        } finally {
            if (printBtn) {
                printBtn.textContent = "🖨 Print Now";
                printBtn.disabled = false;
            }
        }
    }

    // ----------------------------------------------------------------
    // Build ESC/POS document from Frappe doc
    // ----------------------------------------------------------------
    function buildEscPosDoc(doc) {
        const ep = new EscPos(paperWidth);
        const divider = paperWidth === 32 ? "--------------------------------" : "------------------------------------------------";

        ep.init()
          .align("center")
          .bold(true)
          .size(2)
          .text(frappe.boot.sysdefaults?.company || doc.company || "Company")
          .size(1)
          .bold(false);

        // Company address from boot
        if (frappe.boot.sysdefaults?.company_address) {
            ep.text(frappe.boot.sysdefaults.company_address);
        }

        ep.align("left")
          .text(divider)
          .row("Document:", doc.name || "")
          .row("Date:", frappe.datetime.str_to_user(doc.posting_date || doc.transaction_date || ""))
          .row("Customer:", (doc.customer_name || doc.supplier_name || doc.party || "").substring(0, paperWidth - 10))
          .text(divider);

        // Items table header
        ep.bold(true)
          .text("Item")
          .row("Qty x Rate", "Amount")
          .bold(false)
          .text(divider);

        // Line items
        const items = doc.items || [];
        items.forEach(item => {
            const name = (item.item_name || item.item_code || "").substring(0, paperWidth);
            ep.text(name);
            const qtyRate = `${flt(item.qty, 2)} x ${flt(item.rate, 2)}`;
            ep.row(qtyRate, flt(item.amount, 2).toString());
        });

        ep.text(divider);

        // Taxes
        if (doc.taxes && doc.taxes.length) {
            doc.taxes.forEach(tax => {
                ep.row(tax.description || "Tax", flt(tax.tax_amount, 2).toString());
            });
            ep.text(divider);
        }

        // Totals
        if (doc.net_total)   ep.row("Net Total:", flt(doc.net_total, 2).toString());
        if (doc.total_taxes_and_charges) ep.row("Tax:", flt(doc.total_taxes_and_charges, 2).toString());

        ep.bold(true)
          .size(2)
          .row("TOTAL:", flt(doc.grand_total || doc.rounded_total || 0, 2).toString())
          .size(1)
          .bold(false)
          .text(divider);

        // Payment mode if available
        if (doc.mode_of_payment) ep.row("Payment:", doc.mode_of_payment);
        if (doc.paid_amount)     ep.row("Paid:", flt(doc.paid_amount, 2).toString());

        ep.text(divider)
          .align("center")
          .text("Thank You for Your Business!")
          .text("Please Come Again")
          .feed(3)
          .cut();

        return ep.build();
    }

    // ----------------------------------------------------------------
    // Status helper
    // ----------------------------------------------------------------
    function updateStatus(state) {
        const dot  = document.getElementById("mpd-status-dot");
        const text = document.getElementById("mpd-status-text");
        if (!dot || !text) return;

        dot.className = "mpd-status-dot " + state;
        text.textContent = {
            connected:    activeConn ? `Connected via ${activeConn === "bluetooth" ? "Bluetooth 📶" : "USB 🔌"}` : "Connected",
            disconnected: "Not Connected",
            connecting:   "Connecting...",
        }[state] || state;
    }

    // ----------------------------------------------------------------
    // Frappe form button (also adds button in form toolbar)
    // ----------------------------------------------------------------
    function addFormButton(frm) {
        if (!SUPPORTED_DOCTYPES.includes(frm.doctype)) return;
        frm.add_custom_button(__("🖨 Thermal Print"), function () {
            openPrintModal();
        });
    }

    // Register on all supported doctypes
    SUPPORTED_DOCTYPES.forEach(doctype => {
        frappe.ui.form.on(doctype, {
            refresh(frm) {
                if (!frm.is_new()) {
                    addFormButton(frm);
                }
            }
        });
    });

    // Float button helper
    function flt(val, precision = 2) {
        return parseFloat(val || 0).toFixed(precision);
    }

    // Expose for external use
    global.MobilePrinterUI = { updateStatus, openPrintModal, init };

    // Initialize after frappe loads
    if (document.readyState === "complete") {
        init();
    } else {
        window.addEventListener("load", init);
    }

})(window);

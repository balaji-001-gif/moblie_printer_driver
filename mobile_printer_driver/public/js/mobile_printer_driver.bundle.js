// mobile_printer_driver/public/js/mobile_printer_driver.bundle.js
// Entry point for Frappe esbuild
// This file intentionally left minimal – our JS files are loaded via
// app_include_js in hooks.py (served directly, not bundled by esbuild).
// This file exists only so that esbuild can resolve the app's public path.

// No imports needed – all printer logic is in separately included files:
//   escpos.js, bluetooth_printer.js, usb_printer.js, printer_ui.js

app_name = "mobile_printer_driver"
app_title = "Mobile Printer Driver"
app_publisher = "Balaji"
app_description = "Mobile Thermal Printer Driver for ERPNext – Bluetooth & USB OTG via browser"
app_email = ""
app_license = "MIT"

# ----------------------------------------------------------
# Global JS/CSS assets loaded on every ERPNext page
# ----------------------------------------------------------
app_include_js = [
    "/assets/mobile_printer_driver/js/escpos.js",
    "/assets/mobile_printer_driver/js/bluetooth_printer.js",
    "/assets/mobile_printer_driver/js/usb_printer.js",
    "/assets/mobile_printer_driver/js/printer_ui.js",
]

app_include_css = [
    "/assets/mobile_printer_driver/css/printer.css",
]

# DocTypes created by this app
fixtures = [
    "Print Format",
]

# ----------------------------------------------------------
# Boot session – pass printer settings to client
# ----------------------------------------------------------
boot_session = "mobile_printer_driver.api.boot_session"

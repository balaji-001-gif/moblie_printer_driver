# Mobile Printer Driver for ERPNext

> **Print thermal receipts directly from your mobile browser — via Bluetooth or USB OTG — no PC required!**

[![Frappe](https://img.shields.io/badge/Frappe-Framework-blue)](https://frappeframework.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 📶 Bluetooth Printing | Web Bluetooth API — Chrome Android, no app needed |
| 🔌 USB OTG Printing | WebUSB API — plug USB cable from phone to printer |
| 🧾 ESC/POS Encoding | Full command encoder: text, bold, align, cut, feed |
| 📐 58mm & 80mm | Toggle paper width on the fly |
| 🖨 Floating Button | One-tap print on Sales Invoice, POS, Delivery Note |
| ⚙️ Printer Settings | DocType to save preferences per site |
| 🔒 HTTPS Ready | Uses modern browser security APIs |

---

## 📱 Supported Doctypes

- Sales Invoice
- POS Invoice
- Delivery Note
- Sales Order
- Purchase Order
- Quotation
- Payment Entry
- Stock Entry

---

## 🖨 Supported Printers

Any **ESC/POS compatible** thermal printer:

- Xprinter (XP-58, XP-80 series)
- Epson TM-T20 / TM-T82 / TM-T88
- Bixolon SRP-330 / SRP-350
- Rongta RP-80 / RP-58
- iDPRT SP-L series
- Star Micronics TSP series
- Any generic 58mm / 80mm Bluetooth or USB thermal printer

---

## 🚀 Installation

### Requirements
- ERPNext v14 / v15 (Frappe Framework 14+)
- **HTTPS** on your ERPNext site (required for Bluetooth/USB browser APIs)
- Android: Chrome 56+ with Bluetooth or USB OTG cable
- Desktop: Chrome with USB cable

### Install on Bench

```bash
# 1. Get the app
bench get-app mobile_printer_driver https://github.com/balaji-001-gif/moblie_printer_driver.git

# 2. Install on your site
bench --site your-site.local install-app mobile_printer_driver

# 3. Build assets
bench build --app mobile_printer_driver

# 4. Restart
bench restart
```

---

## 📖 How to Use

### On Mobile Browser

1. Open your ERPNext site in **Chrome on Android**
2. Navigate to any **Sales Invoice** (or other supported doctype)
3. Tap the floating **🖨 Print** button at the bottom-right corner
4. In the modal:
   - Select **58mm** or **80mm** paper width
   - Tap **📶 Bluetooth** → select your printer from the list
   - — OR — tap **🔌 USB OTG** → select your USB printer
5. Tap **🖨 Print Now** — receipt prints instantly!

### Printer Settings

Go to: **ERPNext → Settings → Printer Settings**

- Set default paper width
- Set default connection type
- View last connected device name

---

## 🔧 Bluetooth UUIDs (Advanced)

The driver auto-scans for these service UUIDs (most thermal printers use one of them):

| UUID | Printer Family |
|------|---------------|
| `000018f0-...` | Generic Serial (most common) |
| `00001101-...` | SPP – Serial Port Profile |
| `e7810a71-...` | Xprinter / iDPRT |
| `49535343-...` | Microchip BM78 |

If your printer doesn't appear, the driver falls back to **"Accept All Devices"** mode.

---

## 🌐 API Endpoints

```python
# Get printer settings
GET /api/method/mobile_printer_driver.api.get_printer_settings

# Save printer settings
POST /api/method/mobile_printer_driver.api.save_printer_settings
     paper_width, default_connection, bt_device_name, print_format

# Get rendered print HTML
GET /api/method/mobile_printer_driver.api.get_print_html
     doctype, name, print_format
```

---

## 🏗️ App Structure

```
mobile_printer_driver/
├── mobile_printer_driver/
│   ├── public/
│   │   ├── js/
│   │   │   ├── escpos.js           # ESC/POS byte encoder
│   │   │   ├── bluetooth_printer.js # Web Bluetooth driver
│   │   │   ├── usb_printer.js      # WebUSB driver
│   │   │   └── printer_ui.js       # Modal UI + form button
│   │   ├── css/
│   │   │   └── printer.css         # Mobile-first dark theme styles
│   │   └── html/
│   │       └── thermal_pos_58mm.html  # Web preview print template
│   ├── mobile_printer_driver/
│   │   └── doctype/
│   │       └── printer_settings/   # Printer Settings Single DocType
│   ├── api.py                      # Python API endpoints
│   └── hooks.py                    # Frappe app hooks
├── setup.py
├── requirements.txt
└── README.md
```

---

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|---------|
| Bluetooth button doesn't appear | Make sure site is on **HTTPS** |
| Printer not showing in BT list | Enable Bluetooth on phone; make printer discoverable |
| USB device not recognised | Use a proper **USB OTG adapter**; some cables are charge-only |
| Print garbled | Switch paper width (58mm ↔ 80mm) in modal |
| Nothing prints after connect | Try disconnect → reconnect; restart printer |

---

## 📄 License

MIT License — Free to use, modify and distribute.

---

## 👨‍💻 Author

Built for ERPNext + Frappe Framework  
GitHub: [balaji-001-gif](https://github.com/balaji-001-gif)

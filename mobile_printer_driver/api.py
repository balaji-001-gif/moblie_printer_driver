import frappe


@frappe.whitelist()
def get_printer_settings():
    """Return saved Printer Settings for the current user's site."""
    try:
        settings = frappe.get_single("Printer Settings")
        return {
            "paper_width":         settings.paper_width or "58mm",
            "default_connection":  settings.default_connection or "Bluetooth",
            "bt_device_name":      settings.bt_device_name or "",
            "print_format":        settings.print_format or "Thermal POS 58mm",
        }
    except frappe.DoesNotExistError:
        return {
            "paper_width":        "58mm",
            "default_connection": "Bluetooth",
            "bt_device_name":     "",
            "print_format":       "Thermal POS 58mm",
        }


@frappe.whitelist()
def save_printer_settings(paper_width, default_connection, bt_device_name="", print_format=""):
    """Save printer preferences (any logged-in user can call this)."""
    frappe.only_for(frappe.session.user)

    if not frappe.db.exists("DocType", "Printer Settings"):
        return {"status": "error", "message": "Printer Settings DocType not found."}

    settings = frappe.get_single("Printer Settings")
    settings.paper_width        = paper_width
    settings.default_connection = default_connection
    settings.bt_device_name     = bt_device_name
    if print_format:
        settings.print_format   = print_format
    settings.save(ignore_permissions=True)
    return {"status": "ok"}


@frappe.whitelist()
def get_print_html(doctype, name, print_format="Thermal POS 58mm"):
    """
    Returns rendered HTML for a doc using the specified print format.
    The client can display this in a hidden iframe for debug/preview.
    """
    frappe.has_permission(doctype, doc=name, throw=True)
    from frappe.utils.print_format import download_pdf  # noqa
    html = frappe.get_print(doctype, name, print_format=print_format)
    return html


def boot_session(bootinfo):
    """Inject printer settings into boot so client JS can read them instantly."""
    try:
        settings = frappe.get_single("Printer Settings")
        bootinfo["printer_settings"] = {
            "paper_width":        settings.paper_width or "58mm",
            "default_connection": settings.default_connection or "Bluetooth",
            "bt_device_name":     settings.bt_device_name or "",
            "print_format":       settings.print_format or "Thermal POS 58mm",
        }
    except Exception:
        bootinfo["printer_settings"] = {}

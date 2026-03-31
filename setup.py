from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="mobile_printer_driver",
    version="1.0.0",
    description="Mobile Thermal Printer Driver for ERPNext – Bluetooth & USB OTG support via browser",
    author="Balaji",
    author_email="",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)

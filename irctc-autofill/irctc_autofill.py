#!/usr/bin/env python3
"""Semi-automated IRCTC booking-form filler (Playwright).

You stay in control of: login, captcha, OTP and payment.
The script fills: station/date/class/quota search, passenger details, mobile
number and options, then stops before payment.

Usage:
    pip install -r requirements.txt && playwright install chromium
    cp booking.example.json booking.json   # edit it
    python irctc_autofill.py booking.json
"""
import json
import sys
from playwright.sync_api import Page, TimeoutError as PWTimeout, sync_playwright

URL = "https://www.irctc.co.in/nget/train-search"

# IRCTC changes its Angular markup now and then. If something stops filling,
# fix the selector here rather than in the logic below.
SEL = {
    "from": "#origin input",
    "to": "#destination input",
    "date": "#jDate input",
    "class": "#journeyClass",
    "quota": "#journeyQuota",
    "search": "button.search_btn",
    "p_name": "input[placeholder='Name']",
    "p_age": "input[formcontrolname='passengerAge']",
    "p_gender": "select[formcontrolname='passengerGender']",
    "p_berth": "select[formcontrolname='passengerBerthChoice']",
    "add_passenger": "text=+ Add Passenger",
    "mobile": "input[formcontrolname='mobileNumber'], input#mobileNumber",
    "auto_upgrade": "text=Consider for Auto Upgradation",
    "confirm_berths": "text=Book only if confirm berths are allotted",
}
GENDER = {"M": "Male", "F": "Female", "T": "Transgender"}
CLASS_LABEL = {
    "SL": "Sleeper (SL)", "3A": "AC 3 Tier (3A)", "2A": "AC 2 Tier (2A)",
    "1A": "AC First Class (1A)", "CC": "AC Chair car (CC)", "3E": "AC 3 Economy (3E)",
}


def pick_option(page: Page, container: str, label: str) -> None:
    """Open a PrimeNG dropdown and choose the item containing `label`."""
    page.click(container)
    page.locator("p-dropdownitem li, .ui-dropdown-item", has_text=label).first.click()


def fill_station(page: Page, selector: str, value: str) -> None:
    box = page.locator(selector)
    box.click()
    box.fill("")
    box.type(value.split(" - ")[-1], delay=80)  # station code triggers the list
    page.locator("li[role='option'], .ui-autocomplete-list-item").first.click()


def fill_search(page: Page, j: dict) -> None:
    fill_station(page, SEL["from"], j["from"])
    fill_station(page, SEL["to"], j["to"])
    date = page.locator(SEL["date"])
    date.click()
    date.fill(j["date"])
    page.keyboard.press("Escape")
    pick_option(page, SEL["class"], CLASS_LABEL.get(j["class"], j["class"]))
    pick_option(page, SEL["quota"], j["quota"].title())
    page.click(SEL["search"])


def fill_passengers(page: Page, cfg: dict) -> None:
    page.wait_for_selector(SEL["p_name"], timeout=0)  # waits while you pick a train
    for i, p in enumerate(cfg["passengers"]):
        if i > 0:
            page.click(SEL["add_passenger"])
        page.locator(SEL["p_name"]).nth(i).fill(p["name"])
        page.locator(SEL["p_age"]).nth(i).fill(str(p["age"]))
        page.locator(SEL["p_gender"]).nth(i).select_option(label=GENDER[p["gender"].upper()])
        berth = p.get("berth")
        if berth:
            try:
                page.locator(SEL["p_berth"]).nth(i).select_option(label=berth)
            except PWTimeout:
                print(f"  ! berth '{berth}' not offered for passenger {i + 1}")
    if cfg.get("mobile"):
        page.fill(SEL["mobile"], cfg["mobile"])
    opts = cfg.get("options", {})
    if opts.get("autoUpgrade"):
        page.click(SEL["auto_upgrade"])
    if opts.get("confirmBerthsOnly"):
        page.click(SEL["confirm_berths"])


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    cfg = json.load(open(sys.argv[1]))
    with sync_playwright() as pw:
        # Persistent profile keeps your login cookies between runs.
        ctx = pw.chromium.launch_persistent_context(
            "./.browser-profile", headless=False, viewport=None
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(URL)
        input("Log in in the browser (captcha/OTP yourself), then press Enter here... ")
        page.goto(URL)
        fill_search(page, cfg["journey"])
        print("Search submitted. Choose your train/date and click 'Book Now'.")
        fill_passengers(page, cfg)
        print("Passenger details filled. Review, solve captcha, and pay in the browser.")
        input("Press Enter to close the browser when done... ")
        ctx.close()


if __name__ == "__main__":
    main()

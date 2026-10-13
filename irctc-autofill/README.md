# IRCTC autofill assistant

Fills the search form and passenger details on irctc.co.in so you only handle
login, captcha, OTP and payment.

    pip install -r requirements.txt && playwright install chromium
    cp booking.example.json booking.json   # edit your trip + passengers
    python irctc_autofill.py booking.json

Notes
- It does **not** bypass captcha, OTP or payment, and never stores your password.
- IRCTC's terms restrict automated/bulk booking; use it for your own tickets only.
- Selectors live in the `SEL` dict at the top of the script. IRCTC's markup
  changes, so tweak them if a field stops filling (use `playwright codegen`).
- `booking.json` and the browser profile are git-ignored (they hold personal data).

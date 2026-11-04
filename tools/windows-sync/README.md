# Exam Corner Sync (Windows)

ChatGPT या Gemini के scheduled action से जो PDF आप रोज़ download करते हैं, यह tool उसे **अपने आप website पर डाल देता है।** इसके लिए आपको rename, upload या Admin page खोलने की ज़रूरत नहीं है।

**खर्च: ₹0।** यह Windows में पहले से मौजूद PowerShell, free Git for Windows और free GitHub Pages से चलता है।

## यह कैसे काम करता है

1. आप ChatGPT या Gemini में रोज़ की PDF पर **Download** दबाते हैं। File `Downloads` folder में आती है।
2. यह tool हर 10 seconds में `Downloads` folder देखता है।
3. नई PDF मिलते ही वो उसे website पर उसके सही exam, subject और type में डाल देता है।
4. 1–2 मिनट में file website पर दिख जाती है, और घड़ी के पास ✅ का message आता है।

## पहली बार setup (सिर्फ़ एक बार, लगभग 5 मिनट)

1. यह पूरा `windows-sync` folder अपने laptop पर रखें, जैसे `C:\ExamCornerSync`। Setup के बाद folder की जगह मत बदलिए।
2. **`Setup.bat`** पर double-click करें।
   - Git नहीं है तो वो अपने आप install होगा (free)।
   - Browser में GitHub login खुलेगा। Login करके **Authorize** दबाइए।
3. बस हो गया। घड़ी के पास (system tray में) एक ℹ️ icon दिखेगा। Laptop चालू होते ही यह अपने आप चलेगा।

Windows "Windows protected your PC" दिखाए तो **More info → Run anyway** दबाइए। यह आपका अपना script है।

## PDF का नाम: अपने आप सही जगह पहुँचाने का तरीका

अगर PDF का नाम **`EC_`** से शुरू होता है, तो tool बिना कुछ पूछे उसे सही जगह लगा देता है:

```
EC_<EXAM>_<SUBJECT>_<TYPE>_<Title>.pdf
```

| हिस्सा | क्या लिखें |
|---|---|
| EXAM | `UPSC`, `BPSC`, `UPPCS`, `UPESSC`, `BSSC`, `AUDITOR` |
| SUBJECT | exam के subject: `history`, `geography`, `polity`, `economy`, `environment`, `science`, `current-affairs`, `csat`, `mental-ability`. कोई subject नहीं है तो `general` लिखें |
| TYPE | `long` (Long Notes), `short` (Short Notes), `mindmap`, `pyq`. न लिखें तो Long Notes माना जाएगा |
| Title | कुछ भी, शब्दों के बीच `_` |

उदाहरण:
- `EC_UPSC_polity_long_Fundamental_Rights.pdf` → UPSC › Polity › Long Notes
- `EC_BPSC_current-affairs_short_4_Nov_2026.pdf` → BPSC › Current Affairs › Short Notes
- `EC_UPESSC_upessc_pyq_Unit_5.pdf` → Assistant Professor in Economics › UPESSC: your notes & PYQs › PYQ

### ChatGPT / Gemini के scheduled action में यह line जोड़ दें

अपने रोज़ वाले prompt के आख़िर में यह लिख दें (exam और subject अपने हिसाब से बदलें):

> PDF file का नाम ठीक इस तरह रखना: `EC_UPSC_polity_long_<आज का topic>_<आज की तारीख>.pdf`, स्पेस की जगह underscore (_) लगाना।

ChatGPT आम तौर पर file का नाम मान लेता है। Gemini कभी-कभी अपना नाम रख देता है। तब नीचे वाली खिड़की खुलेगी।

## नाम `EC_` से शुरू नहीं हुआ तो?

Downloads में कोई भी नई PDF आए, तो एक छोटी खिड़की खुलती है:
- Exam, Subject, Type और Title चुनिए, फिर **Website पर भेजो** दबाइए।
- वो PDF website की नहीं है (जैसे बैंक statement), तो **छोड़ दो (Skip)** दबाइए।

यह खिड़की नहीं चाहिए, तो `sync-config.json` में `"askForEveryNewPdf": false` कर दें। तब सिर्फ़ `EC_` वाली PDF जाएँगी।

## ज़रूरी settings

- **Chrome / Edge:** Settings → Downloads → *"Ask where to save each file"* **बंद** रखें, ताकि PDF सीधे Downloads में जाए।
- **Laptop और internet:** Download के बाद laptop और internet चालू होना चाहिए। Internet न हो, तो tool हर 2 मिनट में फिर कोशिश करता है।
- **पुरानी PDF:** पहली बार चालू करने से पहले जो PDF Downloads में थीं, वो नहीं भेजी जातीं। सिर्फ़ नई जाती हैं।
- **नया exam या subject:** पहले website के **Admin** page से जोड़ें, फिर उसका नाम file में लिखें। नया exam का छोटा नाम (जैसे `MPPSC`) `sync-config.json` के `examAliases` में भी जोड़ सकते हैं।

## Tray icon (घड़ी के पास) पर right-click

- **Website खोलो**
- **Log देखो:** कौन-सी file कब गई, या क्यों नहीं गई
- **बंद करो (Exit)**

## हटाना हो तो

`Uninstall.bat` पर double-click करें।

## Technical बातें

- Website की copy यहाँ रहती है: `%USERPROFILE%\ExamCorner\site`
- Log और state यहाँ रहते हैं: `%LOCALAPPDATA%\ExamCornerSync\`
- हर upload GitHub पर एक commit बनता है, उसी branch पर जिसे `sync-config.json` का `branch` बताता है। Website इसी branch से चलती है।
- GitHub 95 MB से बड़ी file नहीं लेता।

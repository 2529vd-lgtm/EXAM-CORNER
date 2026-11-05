# 📸 Photo Manager (सिर्फ़ आपके laptop पर)

यह एक छोटी website है जो **आपके laptop पर ही चलती है**। यह `D:\00` folder (और उसके अंदर के सारे folders) की photos और videos दिखाती है, ताकि आप उन्हें आसानी से खोज सकें।

- Photos/videos **कहीं upload नहीं होतीं।** वो वहीं रहती हैं जहाँ हैं।
- Internet सिर्फ़ पहली बार setup और चेहरे पहचानने वाला model (~40 MB) download करने के लिए चाहिए।
- **खर्च: ₹0।**

## क्या-क्या कर सकते हैं

| काम | कैसे |
|---|---|
| 👤 **चेहरे से खोजें** | "लोग" tab में हर इंसान का चेहरा दिखता है। नाम लिखिए, फिर उस पर click करके उसकी सारी photos देखिए। दो-तीन लोग चुनें तो वो photos आएँगी जिनमें सब साथ हैं। |
| 📅 **Date से** | साल, महीना, या "से – तक" date चुनिए। Date photo के अंदर की camera date से आती है। वो न हो तो file के नाम से (`IMG_20230105…`, `WhatsApp Image 2023-01-05…`), नहीं तो file की date से। |
| 📦 **Size से** | Size (MB) में "कम से कम" और "ज़्यादा से ज़्यादा" लिखिए। "बड़ी size पहले" से sort भी कर सकते हैं। |
| 🔍 **नाम / folder से** | ऊपर search box में लिखिए। |
| 🎞️ **Photo या Video** | सिर्फ़ photos या सिर्फ़ videos चुनिए। आड़ी/खड़ी photo, चेहरे वाली/बिना चेहरे वाली भी चुन सकते हैं। |
| 🗂️ **Duplicate** | "Duplicate" tab में बिल्कुल एक जैसी files (copy) और मिलती-जुलती photos (जैसे WhatsApp से छोटी हुई copy) group में दिखती हैं। सबसे अच्छी copy पर **रखें** लिखा होता है, बाकी पर ✔। फिर एक click में delete। |
| 🗑️ **Delete** | Photo खोलकर Delete दबाइए, या "चुनकर delete करें" से कई एक साथ। Files **Recycle Bin** में जाती हैं, गलती हो तो वहाँ से वापस ला सकते हैं। |

## पहली बार चलाना (लगभग 5 मिनट)

1. यह पूरा `photo-manager` folder अपने laptop पर रखिए, जैसे `C:\PhotoManager`।
   (GitHub पर repo खोलें → **Code → Download ZIP** → ZIP खोलकर `tools\photo-manager` folder copy करें।)
2. **`start.bat`** पर double-click करें।
   - Python नहीं है तो वो अपने आप install होगा। उसके बाद `start.bat` एक बार फिर double-click करें।
   - पहली बार ज़रूरी चीज़ें install होंगी (2–5 मिनट)।
3. Browser में `http://127.0.0.1:8765` अपने आप खुल जाएगा।
4. ऊपर **🔄 Scan करें** दबाइए। पहली बार हर photo पढ़ी जाती है, इसलिए हज़ारों photos में कुछ समय (10–40 मिनट) लग सकता है। Scan चलते-चलते भी photos दिखने लगती हैं।

Windows "Windows protected your PC" दिखाए तो **More info → Run anyway** दबाइए।

## रोज़ इस्तेमाल

- `start.bat` double-click करें → browser खुल जाएगा।
- `D:\00` में नई photos डालीं? **🔄 Scan करें** दबाइए। अब सिर्फ़ नई files पढ़ी जाती हैं, इसलिए जल्दी होता है।
- बंद करना हो तो काली window बंद कर दीजिए।

## Folder बदलना

Photos किसी और folder में हैं तो **⚙️ Settings** में path लिखिए (जैसे `E:\Photos`) और Save दबाइए, फिर Scan।

## चेहरों के बारे में

- Scan के बाद "लोग" tab में एक जैसे चेहरे अपने आप एक group में आ जाते हैं।
- एक ही इंसान दो जगह दिखे तो दोनों को **एक ही नाम** दे दीजिए, वो अपने आप जुड़ जाएँगे। या "एक ही इंसान को जोड़ें" चालू करके दोनों चेहरे चुनिए और ✅ दबाइए।
- बच्चे, साइड से ली गई या धुंधली photos में कभी-कभी गलती हो सकती है।
- चेहरे पहचानना बंद करना हो तो Settings में checkbox हटा दीजिए (scan तेज़ हो जाएगा)।

## आपका data कहाँ रहता है

- छोटे thumbnails, चेहरे और index इसी folder के `data` sub-folder में रहते हैं। आपकी original files नहीं बदली जातीं।
- `data` folder delete कर दें तो सब शुरू से बन जाएगा (बस लोगों के नाम दोबारा लिखने पड़ेंगे)।
- Website सिर्फ़ इसी laptop से खुलती है (`127.0.0.1`)। उसी WiFi पर कोई और इसे नहीं खोल सकता।

## कौन सी files

- Photos: JPG, PNG, HEIC (iPhone), WEBP, GIF, BMP, TIFF
- Videos: MP4, MOV, AVI, MKV, 3GP, WMV, WEBM और दूसरे। जो video browser में न चले, वो "Laptop में खोलें" से आपके video player में खुल जाता है।

## दिक्कत हो तो

| दिक्कत | क्या करें |
|---|---|
| "Folder नहीं मिला" | Settings में सही path लिखिए, जैसे `D:\00` |
| "लोग" tab खाली है | पहली बार internet चालू रखकर Scan कीजिए, ताकि face model download हो |
| Browser नहीं खुला | खुद `http://127.0.0.1:8765` खोलिए |
| कुछ और | `.venv` folder delete करके `start.bat` फिर से चलाइए |

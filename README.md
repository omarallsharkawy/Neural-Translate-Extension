# Neural Translate (Manifest V3)

> **إضافة المتصفح الذكية للترجمة الفورية، الاستبدال المكاني المعزول BiDi، وقارئ الكتب والمستندات (PDF / Word / EPUB / Markdown).**  
> مبنية بنظام التصميم التحريري السينمائي الداكن والدافئ (**Cinematic Editorial System**).

---

## 🌟 الميزات الرئيسية (Key Highlights)

1. **الترجمة العائمة والاستبدال المكاني الآمن (In-Place DOM Mutation):**
   * كبسولة عائمة خفيفة تظهر عند تحديد أي نص، تفتح بطاقة ترجمة تحريرية أنيقة.
   * زر 'استبدال مكانه' يستبدل النص الإنجليزي بالنص المترجم فورياً مع الحفاظ على اتجاه الأسطر المحيطة عبر <bdi dir="rtl"> وعزل تام لعلامات الترقيم والمصطلحات البرمجية.
   * إمكانية استرجاع النص الأصلي بنقرة مزدوجة أو عبر شريط الاستعادة العائم أو مفتاح Esc.

2. **الترجمة التلقائية المستمرة للمواقع (Dynamic Auto-Translate):**
   * تفعيل الترجمة التلقائية لنطاق الموقع بالكامل.
   * مراقب محتوى حي (MutationObserver) يرصد الفقرات الجديدة عند التمرير لأسفل (Infinite Scroll) والمحتوى المتغير في تطبيقات React / Next.js ويترجمها تلقائياً.
   * دعم التنقل الداخلي في تطبيقات الصفحة الواحدة (SPA History pushState/popstate).

3. **المحرك الهجين المتعدد (Multi-Engine Architecture):**
   * **محرك GPU المحلي:** دعم نموذج Gemma-4-E2B العامل محلياً عبر Vulkan على المنفذ 28491 بشكل منفصل تماماً ومستقل عن أي واجهات أخرى.
   * **مزودات API السحابية:** دعم واجهات OpenAI-compatible و Anthropic (مثل **DeepSeek V3/V4 Flash**, **GLM-4 Flash**, **OpenRouter**, **Claude 3.5 Haiku**).
   * **محرك سحابي احتياطي:** تحويل صامت وفوري لـ Fast Cloud عند تعذر الخادم المحلي.

4. **قارئ ومترجم المستندات والكتب الطويلة (Neural Reader):**
   * دعم كامل للسحب والإفلات لملفات:
     * **PDF (.pdf):** معالجة نصوص وتجزئة فقرات عبر PDF.js المدمج محلياً.
     * **Word (.docx):** استخراج نصوص وفصول مستندات وورد بدقة XML كاملة عبر JSZip.
     * **EPUB (.epub):** قراءة الكتب الإلكترونية فصلاً فصلاً.
     * **Markdown & TXT (.md, .txt):** تجزئة فورية.
   * وضع العرض المزدوج (**Dual-Pane**) بتمرير وتظليل متزامن.
   * وضع التدفق المترجم (**Inline Flow**) مع كشف قابل للطي للنص الإنجليزي المقابل.
   * خيارات تصدير متعددة: نسخ كامل الترجمة للحافظة بنقرة واحدة، أو حفظها كـ .md أو .txt.

5. **اختصارات لوحة مفاتيح معززة:**
   * Alt + Shift + T أو Alt + Shift + ف: ترجمة كامل الصفحة الحالية.
   * Alt + Shift + R أو Alt + Shift + ق: فتح قارئ ومترجم الكتب في تبويب جديد.
   * Esc: إغلاق النوافذ المنبثقة واسترجاع النصوص الأصلية.

---

## 🛠️ هيكل المشروع (Project Structure)



---

## 🚀 التثبيت والتشغيل (Installation)

### أ. تثبيت نسخة المطورين (Unpacked Mode)
1. افتح متصفح Brave أو Chrome وتوجه إلى: brave://extensions أو chrome://extensions.
2. قم بتفعيل **وضع المطور (Developer mode)**.
3. اضغط **تحميل إضافة غير مجمعة (Load unpacked)** واختر مجلد المشروع:
   

### ب. استخدام النسخة المجمعة الجاهزة (Packed ZIP)
قم بتشغيل سكربت التجميع:
=========================================================
   Packaging Neural Translate Extension (Manifest V3)
=========================================================
Validating syntax...
Bundling into /home/omar/Projects/translation extntion/dist/neural-translate-v1.0.2.zip...

✅ Successfully created packed extension:
-rw-r--r-- 1 omar omar 457K Sep 14 14:17 /home/omar/Projects/translation extntion/dist/neural-translate-v1.0.2.zip

This ZIP file is ready for:
1. Chrome Web Store upload
2. Brave / Edge / Opera Developer Dashboard
3. Direct unpacked or zipped distribution
=========================================================
ستجد ملف الإضافة الجاهز للرفع على Chrome Web Store داخل:


---

## 🧠 تشغيل الذكاء الاصطناعي المحلي (Gemma-4)

تعمل الإضافة مع خدمة نظام مستقلة خاصة بالمستخدم عبر systemd:
○ neural-llama.service - Neural Translate Local Gemma-4 GPU Server (llama-server)
     Loaded: loaded (/home/omar/.config/systemd/user/neural-llama.service; enabled; preset: enabled)
     Active: inactive (dead)

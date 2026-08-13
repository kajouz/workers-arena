import type { ServiceItem } from "./types";

interface CategoryTemplate {
  services: [string, string, number, "hour" | "job"][]; // nameEn, nameAr, price, unit
  specialtyEn: string[];
  specialtyAr: string[];
  portfolioEn: string[];
  portfolioAr: string[];
}

/** Service catalog per trade — realistic bilingual pricing. */
export const CATEGORY_TEMPLATES: Record<string, CategoryTemplate> = {
  plumbing: {
    services: [
      ["Fix leaking pipe", "إصلاح تسريب ماسورة", 120, "job"],
      ["Install faucet / mixer", "تركيب خلاط مياه", 80, "job"],
      ["Unclog drains", "تسليك مجاري", 100, "job"],
      ["Install water heater", "تركيب سخان مياه", 250, "job"],
      ["Bathroom renovation", "تجديد حمام", 900, "job"],
      ["Piping inspection", "فحص مواسير", 150, "job"],
    ],
    specialtyEn: [
      "I specialize in leak detection and pipe replacement using modern tools",
      "From dripping taps to full bathroom renovations, I handle it all",
    ],
    specialtyAr: [
      "أتخصص في كشف التسريبات واستبدال المواسير بأحدث الأدوات",
      "من الخلاطات المتسربة إلى تجديد الحمامات بالكامل، أتولى كل شيء",
    ],
    portfolioEn: ["Bathroom renovation", "Kitchen piping", "Water heater setup", "Pipe re-routing"],
    portfolioAr: ["تجديد حمام", "تمديدات مطبخ", "تركيب سخان", "إعادة توجيه مواسير"],
  },
  electrical: {
    services: [
      ["Fix short circuit", "إصلاح دائرة قصر", 100, "job"],
      ["Install ceiling fan", "تركيب مروحة سقف", 150, "job"],
      ["Room rewiring", "إعادة توصيل غرفة", 400, "job"],
      ["Install lighting", "تركيب إنارة", 120, "job"],
      ["Panel upgrade", "ترقية لوحة كهربائية", 500, "job"],
      ["Smart home wiring", "تمديدات منزل ذكي", 600, "job"],
    ],
    specialtyEn: [
      "Licensed electrician focused on safe, code-compliant installations",
      "I design and rewire homes with full safety testing",
    ],
    specialtyAr: [
      "كهربائي مرخّص أركز على التركيبات الآمنة المطابقة للمواصفات",
      "أصمم وأعيد تمديد المنازل مع فحص أمان شامل",
    ],
    portfolioEn: ["Living room lighting", "Panel upgrade", "Ceiling fans install", "Smart wiring"],
    portfolioAr: ["إنارة صالة", "ترقية لوحة", "تركيب مراوح سقف", "تمديدات ذكية"],
  },
  carpentry: {
    services: [
      ["Custom wardrobe", "خزانة ملابس مخصصة", 1200, "job"],
      ["Fix door hinge", "إصلاح مفصلة باب", 60, "job"],
      ["Kitchen cabinets", "خزائن مطبخ", 1800, "job"],
      ["Wooden shelves", "أرفف خشبية", 200, "job"],
      ["Door installation", "تركيب أبواب", 350, "job"],
      ["Custom furniture", "أثاث مخصص", 1500, "job"],
    ],
    specialtyEn: [
      "Master carpenter for custom wardrobes and built-in furniture",
      "I craft durable woodwork tailored to your space",
    ],
    specialtyAr: [
      "نجار ماهر في الخزائن والأثاث المدمج المخصص",
      "أصنع أعمالاً خشبية متينة تناسب مساحتك",
    ],
    portfolioEn: ["Walk-in wardrobe", "Kitchen cabinets", "TV unit", "Bedroom set"],
    portfolioAr: ["خزانة غرفة ملابس", "خزائن مطبخ", "وحدة تلفاز", "طقم غرفة نوم"],
  },
  painting: {
    services: [
      ["Paint a room", "دهان غرفة", 250, "job"],
      ["Wallpaper installation", "تركيب ورق جدران", 350, "job"],
      ["Facade painting", "دهان واجهة", 900, "job"],
      ["Texture walls", "دهان جبس وتكسية", 300, "job"],
      ["Full apartment paint", "دهان شقة كامل", 1200, "job"],
    ],
    specialtyEn: [
      "Clean, precise painting with premium finishes and zero mess",
      "From single rooms to full facades — flawless coverage guaranteed",
    ],
    specialtyAr: [
      "دهان نظيف ودقيق بلمسات نهائية فاخرة وبدون فوضى",
      "من غرفة واحدة إلى واجهات كاملة — تغطية مثالية مضمونة",
    ],
    portfolioEn: ["Living room refresh", "Bedroom accent wall", "Villa facade", "Wallpaper feature wall"],
    portfolioAr: ["تجديد صالة", "جدار مميز لغرفة نوم", "واجهة فيلا", "جدار ورق جدران"],
  },
  masonry: {
    services: [
      ["Build a wall", "بناء جدار", 400, "job"],
      ["Tile flooring", "تركيب بلاط أرضيات", 500, "job"],
      ["Facade stone work", "أعمال حجر واجهات", 1200, "job"],
      ["Fix wall cracks", "إصلاح شقوق جدران", 150, "job"],
      ["Ceramic installation", "تركيب سيراميك", 450, "job"],
    ],
    specialtyEn: [
      "Experienced mason for walls, tiling and stone facades",
      "I build strong, level structures that last decades",
    ],
    specialtyAr: [
      "بناء متمرس في الجدران والبلاط والواجهات الحجرية",
      "أبني هياكل قوية ومستوية تدوم لعقود",
    ],
    portfolioEn: ["Garden wall", "Marble entrance", "Patio tiling", "Stone facade"],
    portfolioAr: ["جدار حديقة", "مدخل رخام", "بلاط فناء", "واجهة حجر"],
  },
  "ac-technician": {
    services: [
      ["AC maintenance", "صيانة مكيف", 150, "job"],
      ["AC installation", "تركيب مكيف", 300, "job"],
      ["Freon refill", "تعبئة فريون", 200, "job"],
      ["AC repair", "إصلاح مكيف", 180, "job"],
      ["Duct cleaning", "تنظيف مجاري الهواء", 250, "job"],
    ],
    specialtyEn: [
      "Factory-trained AC technician with quick same-day service",
      "I service all major brands — split, window and ducted units",
    ],
    specialtyAr: [
      "فني تكييف مدرّب في المصنع مع خدمة سريعة في نفس اليوم",
      "أخدم جميع الماركات — شباك، سبلت، ومركزي",
    ],
    portfolioEn: ["Split unit install", "Ducted system service", "Emergency repair", "Maintenance contract"],
    portfolioAr: ["تركيب سبلت", "صيانة نظام مركزي", "إصلاح طارئ", "عقد صيانة"],
  },
  "satellite-technician": {
    services: [
      ["Dish installation", "تركيب طبق لاقط", 150, "job"],
      ["Receiver setup", "ضبط رسيفر", 80, "job"],
      ["Cable wiring", "تمديد كابلات", 100, "job"],
      ["Signal optimization", "تحسين الإشارة", 120, "job"],
    ],
    specialtyEn: [
      "Precision dish alignment for crystal-clear channels",
      "I install dishes, receivers and multi-room cabling",
    ],
    specialtyAr: [
      "ضبط دقيق للأطباق اللاقطة للحصول على قنوات واضحة",
      "أركّب الأطباق والرسيفرات وتمديدات الغرف المتعددة",
    ],
    portfolioEn: ["HD dish install", "Multi-room setup", "Signal boost", "Receiver upgrade"],
    portfolioAr: ["تركيب طبق HD", "تركيب متعدد الغرف", "تقوية إشارة", "ترقية رسيفر"],
  },
  mechanic: {
    services: [
      ["Oil change", "تغيير زيت", 80, "job"],
      ["Brake repair", "إصلاح فرامل", 200, "job"],
      ["Engine diagnostic", "فحص محرك إلكتروني", 100, "job"],
      ["Car AC service", "صيانة تكييف سيارة", 250, "job"],
      ["Suspension work", "أعمال نظام التعليق", 300, "job"],
    ],
    specialtyEn: [
      "Certified mechanic with a full workshop and digital diagnostics",
      "From routine service to complex engine repairs",
    ],
    specialtyAr: [
      "ميكانيكي معتمد مع ورشة كاملة وتشخيص رقمي",
      "من الصيانة الدورية إلى إصلاحات المحرك المعقدة",
    ],
    portfolioEn: ["Engine rebuild", "Brake overhaul", "AC recharge", "Suspension upgrade"],
    portfolioAr: ["إعادة بناء محرك", "إصلاح شامل للفرامل", "تعبئة تكييف", "ترقية تعليق"],
  },
  welding: {
    services: [
      ["Steel gate welding", "لحام بوابة حديد", 600, "job"],
      ["Pipe welding", "لحام مواسير", 300, "job"],
      ["Aluminum welding", "لحام ألمنيوم", 350, "job"],
      ["Custom metalwork", "أعمال حديد مخصصة", 800, "job"],
    ],
    specialtyEn: [
      "Certified welder (MIG/TIG) for strong, clean joints",
      "I fabricate gates, stairs and structural steel on site",
    ],
    specialtyAr: [
      "لحام معتمد (MIG/TIG) للوصلات القوية النظيفة",
      "أصنع البوابات والسلالم والحديد الإنشائي في الموقع",
    ],
    portfolioEn: ["Main gate", "Steel staircase", "Aluminum railing", "Structural frame"],
    portfolioAr: ["بوابة رئيسية", "سلالم حديد", "درابزين ألمنيوم", "هيكل إنشائي"],
  },
  blacksmith: {
    services: [
      ["Custom gate", "بوابة مخصصة", 1000, "job"],
      ["Iron railing", "درابزين حديد", 700, "job"],
      ["Window grills", "شبابيك حماية", 550, "job"],
      ["Repair & restoration", "إصلاح وترميم", 100, "job"],
    ],
    specialtyEn: [
      "Traditional blacksmith with modern design flair",
      "Hand-forged gates, railings and decorative ironwork",
    ],
    specialtyAr: [
      "حداد تقليدي بلمسة تصميم عصرية",
      "بوابات ودرابزين وأعمال حديدية مزخرفة مصنوعة يدوياً",
    ],
    portfolioEn: ["Forged main gate", "Decorative railing", "Security grills", "Iron canopy"],
    portfolioAr: ["بوابة مشغولة", "درابزين ديكوري", "شبابيك أمان", "مظلة حديد"],
  },
  roofing: {
    services: [
      ["Roof leak repair", "إصلاح تسريب سقف", 250, "job"],
      ["Roof coating", "عزل أسقف", 800, "job"],
      ["Gutter cleaning", "تنظيف مزراب", 150, "job"],
      ["Roof replacement", "استبدال سقف", 2000, "job"],
    ],
    specialtyEn: [
      "Waterproofing expert — no more ceiling stains",
      "I protect roofs with industrial-grade membranes",
    ],
    specialtyAr: [
      "خبير عزل مائي — وداعاً لبقع الأسقف",
      "أحمي الأسطح بأغشية عزل صناعية",
    ],
    portfolioEn: ["Villa roof coating", "Leak repair", "Gutter system", "Terrace waterproofing"],
    portfolioAr: ["عزل سقف فيلا", "إصلاح تسريب", "نظام مزراب", "عزل سطح"],
  },
  cleaning: {
    services: [
      ["Deep home cleaning", "تنظيف منزل عميق", 300, "job"],
      ["Office cleaning", "تنظيف مكاتب", 400, "job"],
      ["Post-renovation clean", "تنظيف بعد التشطيب", 500, "job"],
      ["Carpet cleaning", "تنظيف سجاد", 150, "job"],
      ["Window cleaning", "تنظيف واجهات زجاج", 200, "job"],
    ],
    specialtyEn: [
      "Eco-friendly products, spotless results",
      "Trained teams for homes, offices and post-construction cleans",
    ],
    specialtyAr: [
      "منتجات صديقة للبيئة ونتائج لامعة",
      "فرق مدربة للمنازل والمكاتب والتنظيف بعد التشطيب",
    ],
    portfolioEn: ["Deep clean villa", "Office contract", "Post-renovation", "Carpet refresh"],
    portfolioAr: ["تنظيف عميق فيلا", "عقد مكتب", "بعد التشطيب", "تجديد سجاد"],
  },
  movers: {
    services: [
      ["Studio move", "نقل استوديو", 400, "job"],
      ["Apartment move", "نقل شقة", 700, "job"],
      ["Villa move", "نقل فيلا", 1500, "job"],
      ["Office move", "نقل مكتب", 1200, "job"],
      ["Packing service", "خدمة التغليف", 250, "job"],
    ],
    specialtyEn: [
      "Careful packing, insured transport, on-time delivery",
      "We dismantle, move and reassemble everything safely",
    ],
    specialtyAr: [
      "تغليف دقيق ونقل مؤمّن وتسليم في الموعد",
      "نفكك وننقل ونعيد التركيب بأمان تام",
    ],
    portfolioEn: ["Apartment relocation", "Office move", "Piano transport", "Villa relocation"],
    portfolioAr: ["نقل شقة", "نقل مكتب", "نقل بيانو", "نقل فيلا"],
  },
  gardening: {
    services: [
      ["Garden design", "تصميم حديقة", 800, "job"],
      ["Lawn care", "عناية بالعشب", 200, "job"],
      ["Tree trimming", "تقليم أشجار", 250, "job"],
      ["Irrigation installation", "تركيب نظام ري", 600, "job"],
    ],
    specialtyEn: [
      "Landscape designer creating green oases",
      "I design, plant and maintain beautiful gardens",
    ],
    specialtyAr: [
      "مصمم مناظر طبيعية يبدع واحات خضراء",
      "أصمم وأزرع وأعتني بالحدائق الجميلة",
    ],
    portfolioEn: ["Backyard oasis", "Drip irrigation", "Palm care", "Rooftop garden"],
    portfolioAr: ["فناء خلفي", "ري بالتنقيط", "عناية بالنخيل", "حديقة سطح"],
  },
  "pest-control": {
    services: [
      ["General fumigation", "إبادة عامة", 300, "job"],
      ["Cockroach control", "مكافحة صراصير", 200, "job"],
      ["Termite treatment", "معالجة نمل أبيض", 900, "job"],
      ["Rodent control", "مكافحة قوارض", 250, "job"],
    ],
    specialtyEn: [
      "Safe, licensed fumigation for homes and businesses",
      "Family- and pet-friendly treatments with lasting results",
    ],
    specialtyAr: [
      "إبادة آمنة ومرخصة للمنازل والشركات",
      "معالجات آمنة للعائلة والحيوانات الأليفة بنتائج دائمة",
    ],
    portfolioEn: ["Villa fumigation", "Restaurant contract", "Termite barrier", "Roofing pest control"],
    portfolioAr: ["إبادة فيلا", "عقد مطعم", "حاجز نمل أبيض", "مكافحة أسطح"],
  },
  locksmith: {
    services: [
      ["Emergency door opening", "فتح أبواب طوارئ", 80, "job"],
      ["Lock replacement", "تغيير أقفال", 120, "job"],
      ["Smart lock install", "تركيب قفل ذكي", 350, "job"],
      ["Key duplication", "نسخ مفاتيح", 40, "job"],
      ["Safe & vault service", "خدمة الخزائن", 200, "job"],
    ],
    specialtyEn: [
      "Rapid response locksmith, available around the clock",
      "I install, repair and upgrade every kind of lock",
    ],
    specialtyAr: [
      "فني أقفال سريع الاستجابة، متاح على مدار الساعة",
      "أركّب وأصلح وأطوّر جميع أنواع الأقفال",
    ],
    portfolioEn: ["Smart lock retrofit", "Safe opening", "Master key system", "Security upgrade"],
    portfolioAr: ["تركيب قفل ذكي", "فتح خزنة", "نظام مفتاح رئيسي", "ترقية أمان"],
  },
  "glass-works": {
    services: [
      ["Window glass", "زجاج نوافذ", 250, "job"],
      ["Glass partitions", "فواصل زجاجية", 800, "job"],
      ["Shower glass", "زجاج دش", 400, "job"],
      ["Mirror installation", "تركيب مرايا", 150, "job"],
    ],
    specialtyEn: [
      "Precision glass cutting and tempered installations",
      "From shopfronts to bathroom glass — perfect fits",
    ],
    specialtyAr: [
      "قص زجاج دقيق وتركيبات زجاج مقسّى",
      "من واجهات المحلات إلى زجاج الحمامات — مقاسات مثالية",
    ],
    portfolioEn: ["Shopfront glass", "Office partition", "Frameless shower", "Mirror wall"],
    portfolioAr: ["زجاج واجهة محل", "فواصل مكتب", "دش بدون إطار", "جدار مرايا"],
  },
  "aluminum-works": {
    services: [
      ["Aluminum windows", "نوافذ ألمنيوم", 600, "job"],
      ["Sliding doors", "أبواب منزلقة", 900, "job"],
      ["Kitchen hood & frames", "أطر وشفاطات مطبخ", 400, "job"],
      ["Aluminum partitions", "فواصل ألمنيوم", 700, "job"],
    ],
    specialtyEn: [
      "Thermal-break aluminum systems for energy efficiency",
      "I fabricate and install modern aluminum frames",
    ],
    specialtyAr: [
      "أنظمة ألمنيوم مقطوعة حرارياً لكفاءة الطاقة",
      "أصنع وأركّب إطارات ألمنيوم عصرية",
    ],
    portfolioEn: ["Thermal windows", "Sliding door wall", "Office partitions", "Frames & shutters"],
    portfolioAr: ["نوافذ حرارية", "جدار أبواب منزلقة", "فواصل مكاتب", "أطر وستائر معدنية"],
  },
  "gypsum-works": {
    services: [
      ["Gypsum ceiling", "أسقف جبسية", 800, "job"],
      ["Gypsum partitions", "فواصل جبس", 350, "job"],
      ["Decorative wall", "جدران ديكورية", 450, "job"],
      ["Gypsum repair", "إصلاح جبس", 120, "job"],
    ],
    specialtyEn: [
      "Creative gypsum designs with LED integration",
      "From modern ceilings to ornate wall features",
    ],
    specialtyAr: [
      "تصاميم جبس مبتكرة مع دمج إضاءة LED",
      "من الأسقف العصرية إلى جدران ديكورية فاخرة",
    ],
    portfolioEn: ["LED ceiling design", "Living room partition", "Wall panels", "Cove lighting"],
    portfolioAr: ["سقف بإضاءة LED", "فاصل صالة", "ألواح جدران", "إضاءة مخفية"],
  },
  "interior-design": {
    services: [
      ["Full apartment design", "تصميم شقة كامل", 2500, "job"],
      ["Room redesign", "إعادة تصميم غرفة", 900, "job"],
      ["Color consultation", "استشارة ألوان", 300, "job"],
      ["3D rendering", "تصور ثلاثي الأبعاد", 500, "job"],
    ],
    specialtyEn: [
      "Award-winning designer for modern Arabic interiors",
      "I turn spaces into experiences with 3D previews",
    ],
    specialtyAr: [
      "مصمم حائز على جوائز للديكورات العربية العصرية",
      "أحوّل المساحات إلى تجارب مع معاينة ثلاثية الأبعاد",
    ],
    portfolioEn: ["Penthouse redesign", "Majlis design", "Office interior", "3D walkthrough"],
    portfolioAr: ["إعادة تصميم بنتهاوس", "تصميم مجلس", "ديكور مكتب", "جولة ثلاثية الأبعاد"],
  },
  construction: {
    services: [
      ["Villa construction", "بناء فيلا", 15000, "job"],
      ["Full renovation", "تجديد شامل", 8000, "job"],
      ["Foundation works", "أعمال أساسات", 5000, "job"],
      ["Project management", "إدارة مشاريع", 4000, "job"],
    ],
    specialtyEn: [
      "Licensed contractor with a full engineering team",
      "We deliver turnkey projects on time and on budget",
    ],
    specialtyAr: [
      "مقاول مرخّص مع فريق هندسي متكامل",
      "نسلّم مشاريع متكاملة في الموعد وضمن الميزانية",
    ],
    portfolioEn: ["Villa project", "Commercial build", "Renovation program", "Landscape scope"],
    portfolioAr: ["مشروع فيلا", "بناء تجاري", "برنامج تجديد", "نطاق تنسيق موقع"],
  },
};

export const QUALITY_EN = [
  "I arrive on time, with all the right tools and a clean uniform",
  "Every job is backed by a service guarantee",
  "Free estimates and honest, transparent pricing",
  "Licensed, insured and fully background-checked",
  "I keep every project neat, tidy and safe",
];

export const QUALITY_AR = [
  "أصل في الموعد مع كل الأدوات اللازمة وزي نظيف",
  "كل مهمة مضمونة بخدمة ما بعد التنفيذ",
  "تقديرات مجانية وأسعار صادقة وشفافة",
  "مرخّص ومؤمَّن ومفحوص الخلفية بالكامل",
  "أحافظ على نظافة الموقع وسلامته في كل مشروع",
];

export const REVIEWS_5_EN = [
  "Excellent work! Very professional, fast and fairly priced. Highly recommended.",
  "He fixed the problem in under an hour — great service and spotless finish.",
  "Superb quality and very polite. Will definitely hire again.",
  "Arrived on time, did the job perfectly and cleaned up after. 5 stars!",
  "Honest, skilled and reasonably priced. A true professional.",
  "Best in the area by far. Went above and beyond what we agreed.",
  "Quick response, clear quote, flawless execution. Couldn't ask for more.",
  "Very happy with the result. My neighbors already asked for his number.",
];

export const REVIEWS_5_AR = [
  "عمل ممتاز! احترافية عالية وسرعة وأسعار عادلة. أنصح به بشدة.",
  "أصلح المشكلة في أقل من ساعة — خدمة رائعة ولمسة نهائية مثالية.",
  "جودة فائقة وأخلاق عالية. سأتعاقد معه مجدداً بالتأكيد.",
  "وصل في الموعد، أنجز العمل بإتقان ونظّف المكان بعدها. خمس نجوم!",
  "صادق وماهر وأسعاره معقولة. محترف حقيقي.",
  "الأفضل في المنطقة بلا منازع. تجاوز ما اتفقنا عليه.",
  "استجابة سريعة وعرض سعر واضح وتنفيذ لا غبار عليه.",
  "سعيد جداً بالنتيجة. جيراني طلبوا رقمه بالفعل.",
];

export const REVIEWS_4_EN = [
  "Good work overall — communication could be a little faster.",
  "Solid job, slightly over the estimate but quality was good.",
  "Nice guy, did what he promised. Minor delay on the day.",
  "Very good craftsmanship, would recommend for bigger jobs.",
];

export const REVIEWS_4_AR = [
  "عمل جيد بشكل عام — التواصل قد يكون أسرع قليلاً.",
  "عمل متين، تجاوز التقدير قليلاً لكن الجودة كانت جيدة.",
  "شخص لطيف ونفذ ما وعد به. تأخير بسيط في اليوم المحدد.",
  "حرفية جيدة جداً، أنصح به للمشاريع الأكبر.",
];

export const REVIEWS_3_EN = [
  "Decent work, but the finish could be better.",
  "Average experience — took longer than expected.",
];

export const REVIEWS_3_AR = [
  "عمل مقبول، لكن اللمسة النهائية يمكن أن تكون أفضل.",
  "تجربة متوسطة — استغرق وقتاً أطول من المتوقع.",
];

export const AUTHOR_NAMES = [
  "Ahmed S.",
  "Sara M.",
  "Mohammed K.",
  "Fatima A.",
  "Omar R.",
  "Layla H.",
  "Khalid N.",
  "Noor E.",
  "Hassan T.",
  "Aisha B.",
  "Youssef D.",
  "Mariam F.",
];

export const LANGUAGES = [
  { code: "ar", nameEn: "Arabic", nameAr: "العربية" },
  { code: "en", nameEn: "English", nameAr: "الإنجليزية" },
  { code: "fr", nameEn: "French", nameAr: "الفرنسية" },
  { code: "ur", nameEn: "Urdu", nameAr: "الأردية" },
  { code: "hi", nameEn: "Hindi", nameAr: "الهندية" },
  { code: "tr", nameEn: "Turkish", nameAr: "التركية" },
];

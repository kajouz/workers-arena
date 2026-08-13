import type { Category } from "./types";

export const CATEGORIES: Category[] = [
  { slug: "plumbing", nameEn: "Plumbing", nameAr: "سباكة", professionEn: "plumber", professionAr: "سباك", icon: "Wrench", taglineEn: "Leaks, pipes, water heaters", taglineAr: "تسريبات، مواسير، سخانات", hue: 205, workerCount: 0 },
  { slug: "electrical", nameEn: "Electrical", nameAr: "كهرباء", professionEn: "electrician", professionAr: "كهربائي", icon: "Zap", taglineEn: "Wiring, panels, lighting", taglineAr: "تمديدات، لوحات، إنارة", hue: 45, workerCount: 0 },
  { slug: "carpentry", nameEn: "Carpentry", nameAr: "نجارة", professionEn: "carpenter", professionAr: "نجار", icon: "Hammer", taglineEn: "Custom woodwork & furniture", taglineAr: "أعمال خشب وأثاث مخصص", hue: 25, workerCount: 0 },
  { slug: "painting", nameEn: "Painting", nameAr: "دهان", professionEn: "painter", professionAr: "دهان", icon: "Paintbrush", taglineEn: "Interior & exterior painting", taglineAr: "دهان داخلي وخارجي", hue: 340, workerCount: 0 },
  { slug: "masonry", nameEn: "Masonry", nameAr: "بناء", professionEn: "mason", professionAr: "بناء", icon: "Layers", taglineEn: "Walls, tiles, facades", taglineAr: "جدران، بلاط، واجهات", hue: 30, workerCount: 0 },
  { slug: "ac-technician", nameEn: "AC Technician", nameAr: "فني تكييف", professionEn: "AC technician", professionAr: "فني تكييف", icon: "Snowflake", taglineEn: "Install, repair, maintain ACs", taglineAr: "تركيب وإصلاح وصيانة مكيفات", hue: 190, workerCount: 0 },
  { slug: "satellite-technician", nameEn: "Satellite Technician", nameAr: "فني أقمار صناعية", professionEn: "satellite technician", professionAr: "فني أقمار صناعية", icon: "Antenna", taglineEn: "Dishes, receivers, cabling", taglineAr: "أطباق، رسيفرات، كابلات", hue: 260, workerCount: 0 },
  { slug: "mechanic", nameEn: "Car Mechanic", nameAr: "ميكانيكي سيارات", professionEn: "car mechanic", professionAr: "ميكانيكي سيارات", icon: "Car", taglineEn: "Repairs, diagnostics, service", taglineAr: "إصلاح، فحص، صيانة", hue: 210, workerCount: 0 },
  { slug: "welding", nameEn: "Welding", nameAr: "لحام", professionEn: "welder", professionAr: "لحام", icon: "Flame", taglineEn: "Steel & metal fabrication", taglineAr: "أعمال حديد وتشكيل معادن", hue: 10, workerCount: 0 },
  { slug: "blacksmith", nameEn: "Blacksmith", nameAr: "حدادة", professionEn: "blacksmith", professionAr: "حداد", icon: "Anvil", taglineEn: "Gates, railings, grills", taglineAr: "بوابات، درابزين، شبابيك", hue: 0, workerCount: 0 },
  { slug: "roofing", nameEn: "Roofing", nameAr: "أسقف وعزل", professionEn: "roofer", professionAr: "خبير أسقف", icon: "Home", taglineEn: "Leak-proofing & roofing", taglineAr: "عزل وإصلاح أسقف", hue: 140, workerCount: 0 },
  { slug: "cleaning", nameEn: "Cleaning Services", nameAr: "خدمات تنظيف", professionEn: "cleaning specialist", professionAr: "خبير تنظيف", icon: "Sparkles", taglineEn: "Homes, offices, deep cleans", taglineAr: "منازل، مكاتب، تنظيف عميق", hue: 155, workerCount: 0 },
  { slug: "movers", nameEn: "Movers", nameAr: "نقل أثاث", professionEn: "moving specialist", professionAr: "خبير نقل", icon: "Truck", taglineEn: "Apartment & office moves", taglineAr: "نقل شقق ومكاتب", hue: 220, workerCount: 0 },
  { slug: "gardening", nameEn: "Gardening", nameAr: "بستنة", professionEn: "gardener", professionAr: "بستاني", icon: "Flower2", taglineEn: "Landscaping & lawn care", taglineAr: "تنسيق حدائق وعناية بالعشب", hue: 110, workerCount: 0 },
  { slug: "pest-control", nameEn: "Pest Control", nameAr: "مكافحة حشرات", professionEn: "pest control specialist", professionAr: "خبير مكافحة حشرات", icon: "Bug", taglineEn: "Fumigation & treatment", taglineAr: "إبادة ومعالجة", hue: 80, workerCount: 0 },
  { slug: "locksmith", nameEn: "Locksmith", nameAr: "أقفال ومفاتيح", professionEn: "locksmith", professionAr: "فني أقفال", icon: "KeyRound", taglineEn: "Locks, keys, security", taglineAr: "أقفال، مفاتيح، أمان", hue: 285, workerCount: 0 },
  { slug: "glass-works", nameEn: "Glass Works", nameAr: "زجاج", professionEn: "glass installer", professionAr: "فني زجاج", icon: "GlassWater", taglineEn: "Windows, partitions, mirrors", taglineAr: "نوافذ، فواصل، مرايا", hue: 195, workerCount: 0 },
  { slug: "aluminum-works", nameEn: "Aluminum Works", nameAr: "ألمنيوم", professionEn: "aluminum specialist", professionAr: "متخصص ألمنيوم", icon: "Component", taglineEn: "Windows, doors, facades", taglineAr: "نوافذ، أبواب، واجهات", hue: 50, workerCount: 0 },
  { slug: "gypsum-works", nameEn: "Gypsum Works", nameAr: "جبس", professionEn: "gypsum specialist", professionAr: "متخصص جبس", icon: "Box", taglineEn: "Ceilings, partitions, décor", taglineAr: "أسقف، فواصل، ديكور", hue: 320, workerCount: 0 },
  { slug: "interior-design", nameEn: "Interior Design", nameAr: "تصميم داخلي", professionEn: "interior designer", professionAr: "مصمم داخلي", icon: "Sofa", taglineEn: "Spaces, colors, 3D renders", taglineAr: "مساحات، ألوان، تصور ثلاثي", hue: 270, workerCount: 0 },
  { slug: "construction", nameEn: "Construction", nameAr: "مقاولات", professionEn: "contractor", professionAr: "مقاول", icon: "HardHat", taglineEn: "Building & renovation", taglineAr: "بناء وتجديد", hue: 130, workerCount: 0 },
];

export const categoryBySlug = (slug: string): Category | undefined =>
  CATEGORIES.find((c) => c.slug === slug);

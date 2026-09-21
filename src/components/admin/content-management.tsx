"use client";

import { useState } from "react";
import { cn, formatDate } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { FileText, Plus, Edit, Trash2, Globe, Eye, Save, Search } from "lucide-react";

interface CMSPage {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  contentEn: string;
  contentAr: string;
  metaTitleEn: string;
  metaTitleAr: string;
  metaDescriptionEn: string;
  metaDescriptionAr: string;
  status: "published" | "draft";
  updatedAt: string;
}

export function ContentManagement() {
  const { locale } = useLocale();
  const [pages, setPages] = useState<CMSPage[]>([
    { id: "1", slug: "about", titleEn: "About Us", titleAr: "من نحن", contentEn: "WorkersArena is...", contentAr: "ووركرز أرينا هي...", metaTitleEn: "About WorkersArena", metaTitleAr: "عن ووركرز أرينا", metaDescriptionEn: "Learn about WorkersArena", metaDescriptionAr: "تعرف على ووركرز أرينا", status: "published", updatedAt: "2025-01-15T10:00:00Z" },
    { id: "2", slug: "terms", titleEn: "Terms of Service", titleAr: "شروط الخدمة", contentEn: "Terms content...", contentAr: "محتوى الشروط...", metaTitleEn: "Terms of Service", metaTitleAr: "شروط الخدمة", metaDescriptionEn: "Our terms", metaDescriptionAr: "شروطنا", status: "published", updatedAt: "2025-01-10T10:00:00Z" },
    { id: "3", slug: "privacy", titleEn: "Privacy Policy", titleAr: "سياسة الخصوصية", contentEn: "Privacy content...", contentAr: "محتوى الخصوصية...", metaTitleEn: "Privacy Policy", metaTitleAr: "سياسة الخصوصية", metaDescriptionEn: "Our privacy policy", metaDescriptionAr: "سياسة الخصوصية الخاصة بنا", status: "published", updatedAt: "2025-01-10T10:00:00Z" },
    { id: "4", slug: "faq", titleEn: "FAQ", titleAr: "الأسئلة الشائعة", contentEn: "FAQ content...", contentAr: "محتوى الأسئلة...", metaTitleEn: "FAQ", metaTitleAr: "الأسئلة الشائعة", metaDescriptionEn: "Frequently asked questions", metaDescriptionAr: "الأسئلة المتكررة", status: "draft", updatedAt: "2025-01-17T10:00:00Z" },
  ]);
  const [editingPage, setEditingPage] = useState<CMSPage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPages = pages.filter((p) =>
    p.titleEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = () => {
    if (!editingPage) return;
    setPages(pages.map((p) => p.id === editingPage.id ? editingPage : p));
    setEditingPage(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400 dark:text-ink-500" />
          <input type="text" placeholder="Search pages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg" />
        </div>
        <button onClick={() => setEditingPage({ id: "", slug: "", titleEn: "", titleAr: "", contentEn: "", contentAr: "", metaTitleEn: "", metaTitleAr: "", metaDescriptionEn: "", metaDescriptionAr: "", status: "draft", updatedAt: new Date().toISOString() })} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Page
        </button>
      </div>

      {editingPage ? (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{editingPage.id ? "Edit Page" : "New Page"}</h3>
            <button onClick={() => setEditingPage(null)} className="text-ink-400 dark:text-ink-500 hover:text-ink-600 dark:hover:text-ink-300">Cancel</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Slug</label><input type="text" value={editingPage.slug} onChange={(e) => setEditingPage({ ...editingPage, slug: e.target.value })} className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Status</label><select value={editingPage.status} onChange={(e) => setEditingPage({ ...editingPage, status: e.target.value as "published" | "draft" })} className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg"><option value="draft">Draft</option><option value="published">Published</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Title (EN)</label><input type="text" value={editingPage.titleEn} onChange={(e) => setEditingPage({ ...editingPage, titleEn: e.target.value })} className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Title (AR)</label><input type="text" value={editingPage.titleAr} onChange={(e) => setEditingPage({ ...editingPage, titleAr: e.target.value })} className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg" dir="rtl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Content (EN)</label><textarea value={editingPage.contentEn} onChange={(e) => setEditingPage({ ...editingPage, contentEn: e.target.value })} rows={6} className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Content (AR)</label><textarea value={editingPage.contentAr} onChange={(e) => setEditingPage({ ...editingPage, contentAr: e.target.value })} rows={6} className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg" dir="rtl" /></div>
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><Save className="w-4 h-4" /> Save Page</button>
        </div>
      ) : (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
          <table className="w-full">
            <thead className="bg-ink-50 dark:bg-ink-950"><tr><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Page</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Slug</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Status</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Updated</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Actions</th></tr></thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {filteredPages.map((page) => (
                <tr key={page.id} className="hover:bg-ink-50 dark:hover:bg-ink-950">
                  <td className="px-4 py-4"><p className="font-medium text-ink-900 dark:text-ink-50">{page.titleEn}</p><p className="text-sm text-ink-500 dark:text-ink-400">{page.titleAr}</p></td>
                  <td className="px-4 py-4 font-mono text-sm text-ink-600 dark:text-ink-300">/{page.slug}</td>
                  <td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", page.status === "published" ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" : "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100")}>{page.status}</span></td>
                  <td className="px-4 py-4 text-sm text-ink-500 dark:text-ink-400">{formatDate(page.updatedAt, locale)}</td>
                  <td className="px-4 py-4"><button onClick={() => setEditingPage(page)} className="text-blue-600 hover:text-blue-700"><Edit className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

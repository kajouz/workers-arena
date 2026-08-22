"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search pages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg" />
        </div>
        <button onClick={() => setEditingPage({ id: "", slug: "", titleEn: "", titleAr: "", contentEn: "", contentAr: "", metaTitleEn: "", metaTitleAr: "", metaDescriptionEn: "", metaDescriptionAr: "", status: "draft", updatedAt: new Date().toISOString() })} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Page
        </button>
      </div>

      {editingPage ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{editingPage.id ? "Edit Page" : "New Page"}</h3>
            <button onClick={() => setEditingPage(null)} className="text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Slug</label><input type="text" value={editingPage.slug} onChange={(e) => setEditingPage({ ...editingPage, slug: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Status</label><select value={editingPage.status} onChange={(e) => setEditingPage({ ...editingPage, status: e.target.value as "published" | "draft" })} className="w-full px-3 py-2 border border-gray-200 rounded-lg"><option value="draft">Draft</option><option value="published">Published</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Title (EN)</label><input type="text" value={editingPage.titleEn} onChange={(e) => setEditingPage({ ...editingPage, titleEn: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Title (AR)</label><input type="text" value={editingPage.titleAr} onChange={(e) => setEditingPage({ ...editingPage, titleAr: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg" dir="rtl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Content (EN)</label><textarea value={editingPage.contentEn} onChange={(e) => setEditingPage({ ...editingPage, contentEn: e.target.value })} rows={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Content (AR)</label><textarea value={editingPage.contentAr} onChange={(e) => setEditingPage({ ...editingPage, contentAr: e.target.value })} rows={6} className="w-full px-3 py-2 border border-gray-200 rounded-lg" dir="rtl" /></div>
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"><Save className="w-4 h-4" /> Save Page</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Page</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Slug</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Updated</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPages.map((page) => (
                <tr key={page.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4"><p className="font-medium text-gray-900">{page.titleEn}</p><p className="text-sm text-gray-500">{page.titleAr}</p></td>
                  <td className="px-4 py-4 font-mono text-sm text-gray-600">/{page.slug}</td>
                  <td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", page.status === "published" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800")}>{page.status}</span></td>
                  <td className="px-4 py-4 text-sm text-gray-500">{new Date(page.updatedAt).toLocaleDateString()}</td>
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

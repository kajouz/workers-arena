"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  Eye,
  EyeOff,
  Save,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Category {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  icon: string;
  workerCount: number;
  isActive: boolean;
  sortOrder: number;
}

const DEMO_CATEGORIES: Category[] = [
  { id: "1", slug: "plumbing", nameEn: "Plumbing", nameAr: "سباكة", icon: "🔧", workerCount: 45, isActive: true, sortOrder: 1 },
  { id: "2", slug: "electrical", nameEn: "Electrical", nameAr: "كهرباء", icon: "⚡", workerCount: 38, isActive: true, sortOrder: 2 },
  { id: "3", slug: "carpentry", nameEn: "Carpentry", nameAr: "نجارة", icon: "🪚", workerCount: 32, isActive: true, sortOrder: 3 },
  { id: "4", slug: "painting", nameEn: "Painting", nameAr: "دهان", icon: "🎨", workerCount: 28, isActive: true, sortOrder: 4 },
  { id: "5", slug: "ac-technician", nameEn: "AC Technician", nameAr: "فني تكييف", icon: "❄️", workerCount: 25, isActive: true, sortOrder: 5 },
  { id: "6", slug: "cleaning", nameEn: "Cleaning", nameAr: "تنظيف", icon: "🧹", workerCount: 22, isActive: true, sortOrder: 6 },
  { id: "7", slug: "masonry", nameEn: "Masonry", nameAr: "بناء", icon: "🧱", workerCount: 18, isActive: true, sortOrder: 7 },
  { id: "8", slug: "movers", nameEn: "Movers", nameAr: "نقل أثاث", icon: "🚚", workerCount: 15, isActive: false, sortOrder: 8 },
];

export function CategoryAdmin({ locale = "en" }: { locale?: string }) {
  const [categories, setCategories] = useState(DEMO_CATEGORIES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState({ nameEn: "", nameAr: "", icon: "📋" });

  const toggleActive = (id: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c))
    );
  };

  const deleteCategory = (id: string) => {
    if (confirm("Are you sure you want to delete this category?")) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const addCategory = () => {
    if (newCategory.nameEn && newCategory.nameAr) {
      const newId = String(categories.length + 1);
      const slug = newCategory.nameEn.toLowerCase().replace(/\s+/g, "-");
      setCategories((prev) => [
        ...prev,
        {
          id: newId,
          slug,
          nameEn: newCategory.nameEn,
          nameAr: newCategory.nameAr,
          icon: newCategory.icon,
          workerCount: 0,
          isActive: true,
          sortOrder: prev.length + 1,
        },
      ]);
      setNewCategory({ nameEn: "", nameAr: "", icon: "📋" });
      setShowAddForm(false);
    }
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setCategories((prev) => {
      const newCategories = [...prev];
      [newCategories[index - 1], newCategories[index]] = [newCategories[index], newCategories[index - 1]];
      return newCategories.map((c, i) => ({ ...c, sortOrder: i + 1 }));
    });
  };

  const moveDown = (index: number) => {
    if (index === categories.length - 1) return;
    setCategories((prev) => {
      const newCategories = [...prev];
      [newCategories[index], newCategories[index + 1]] = [newCategories[index + 1], newCategories[index]];
      return newCategories.map((c, i) => ({ ...c, sortOrder: i + 1 }));
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 transition-colors hover:underline dark:text-brand-400"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> Back to Dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            <FolderTree className="size-6 text-brand-500" /> Category Management
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Manage service categories, toggle visibility, and reorder
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)} size="sm">
          <Plus className="size-4 mr-2" />
          Add Category
        </Button>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-ink-900 dark:text-ink-50">{categories.length}</p>
            <p className="text-xs text-ink-400">Total Categories</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-emerald-600">{categories.filter((c) => c.isActive).length}</p>
            <p className="text-xs text-ink-400">Active</p>
          </CardContent>
        </Card>
        <Card className="border-ink-500/20 bg-ink-500/5">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-black text-ink-500">{categories.filter((c) => !c.isActive).length}</p>
            <p className="text-xs text-ink-400">Inactive</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <Card className="mt-6 border-brand-500/30">
          <CardHeader>
            <CardTitle className="text-base">Add New Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Name (English)</label>
                <input
                  type="text"
                  value={newCategory.nameEn}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, nameEn: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900"
                  placeholder="e.g., Plumbing"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Name (Arabic)</label>
                <input
                  type="text"
                  value={newCategory.nameAr}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, nameAr: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900"
                  placeholder="e.g., سباكة"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Icon</label>
                <input
                  type="text"
                  value={newCategory.icon}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, icon: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900"
                  placeholder="🔧"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={addCategory} size="sm">
                <Save className="size-4 mr-2" /> Save
              </Button>
              <Button onClick={() => setShowAddForm(false)} variant="outline" size="sm">
                <X className="size-4 mr-2" /> Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category List */}
      <div className="mt-6 space-y-2">
        {categories.map((category, i) => (
          <motion.div
            key={category.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <Card className={`transition-all ${!category.isActive ? "opacity-60" : ""}`}>
              <CardContent className="flex items-center gap-4 p-4">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30 dark:hover:bg-ink-800"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === categories.length - 1}
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 disabled:opacity-30 dark:hover:bg-ink-800"
                  >
                    ▼
                  </button>
                </div>

                {/* Icon */}
                <div className="flex size-10 items-center justify-center rounded-xl bg-ink-100 text-xl dark:bg-ink-800">
                  {category.icon}
                </div>

                {/* Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-ink-900 dark:text-ink-50">
                      {locale === "ar" ? category.nameAr : category.nameEn}
                    </p>
                    <span className="text-xs text-ink-400">({category.slug})</span>
                  </div>
                  <p className="text-xs text-ink-400">
                    {category.workerCount} workers · Order: {category.sortOrder}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Badge variant={category.isActive ? "success" : "secondary"}>
                    {category.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => toggleActive(category.id)}
                  >
                    {category.isActive ? (
                      <EyeOff className="size-3 text-amber-500" />
                    ) : (
                      <Eye className="size-3 text-emerald-500" />
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2">
                    <Edit2 className="size-3 text-blue-500" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => deleteCategory(category.id)}
                  >
                    <Trash2 className="size-3 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

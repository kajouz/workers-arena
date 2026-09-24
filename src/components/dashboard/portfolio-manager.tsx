"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical, Camera, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { capturePhoto, compressPhoto } from "@/lib/mobile/camera";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface PortfolioEntry {
  id: string;
  titleEn: string;
  titleAr: string;
  beforeUrl?: string;
  afterUrl?: string;
  hue: number;
}

interface PortfolioManagerProps {
  items: PortfolioEntry[];
  onSave: (items: PortfolioEntry[]) => Promise<void>;
}

/**
 * Portfolio builder — lets workers manage their before/after project photos.
 * Designed for the dashboard; captures photos via camera or file picker.
 */
export function PortfolioManager({ items, onSave }: PortfolioManagerProps) {
  const { locale } = useLocale();
  const [entries, setEntries] = useState<PortfolioEntry[]>(items);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const addEntry = () => {
    const id = `new-${Date.now()}`;
    setEntries((prev) => [
      ...prev,
      { id, titleEn: "", titleAr: "", hue: Math.floor(Math.random() * 360) },
    ]);
    setEditing(id);
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, updates: Partial<PortfolioEntry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  };

  const captureImage = async (id: string, type: "before" | "after") => {
    const result = await capturePhoto({ quality: 80 });
    if (!result) return;
    const compressed = await compressPhoto(result.dataUrl, 800, 70);
    updateEntry(id, {
      [type === "before" ? "beforeUrl" : "afterUrl"]: compressed,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(entries);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Portfolio Projects</h3>
        <Button size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4 me-1" />
          Add Project
        </Button>
      </div>

      {entries.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Camera className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              No portfolio projects yet. Add your best before/after work to stand out.
            </p>
          </CardContent>
        </Card>
      )}

      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="pt-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Title (English)"
                    value={entry.titleEn}
                    onChange={(e) => updateEntry(entry.id, { titleEn: e.target.value })}
                  />
                  <Input
                    placeholder="العنوان (عربي)"
                    value={entry.titleAr}
                    onChange={(e) => updateEntry(entry.id, { titleAr: e.target.value })}
                    dir="rtl"
                  />
                </div>

                {/* Before/After photos */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Before</p>
                    <button
                      onClick={() => captureImage(entry.id, "before")}
                      className="w-full aspect-video rounded-lg border-2 border-dashed flex items-center justify-center hover:border-brand-500 transition-colors overflow-hidden"
                    >
                      {entry.beforeUrl ? (
                        <img
                          src={entry.beforeUrl}
                          alt="Before"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="h-6 w-6 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">After</p>
                    <button
                      onClick={() => captureImage(entry.id, "after")}
                      className="w-full aspect-video rounded-lg border-2 border-dashed flex items-center justify-center hover:border-brand-500 transition-colors overflow-hidden"
                    >
                      {entry.afterUrl ? (
                        <img
                          src={entry.afterUrl}
                          alt="After"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="h-6 w-6 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeEntry(entry.id)}
                className="p-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      ))}

      {entries.length > 0 && (
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="h-4 w-4 me-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 me-2" />
          )}
          Save Portfolio
        </Button>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { 
  GripVertical, 
  Eye, 
  EyeOff, 
  Settings, 
  Save, 
  RotateCcw,
  Plus,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Widget {
  id: string;
  name: string;
  type: "chart" | "table" | "stats" | "feed";
  enabled: boolean;
  size: "small" | "medium" | "large";
  position: number;
}

interface WidgetManagerProps {
  className?: string;
}

/**
 * Dashboard Customization component
 * Drag-and-drop widget management
 */
export function WidgetManager({ className }: WidgetManagerProps) {
  const [widgets, setWidgets] = useState<Widget[]>([
    { id: "revenue", name: "Revenue Chart", type: "chart", enabled: true, size: "large", position: 0 },
    { id: "bookings", name: "Booking Stats", type: "stats", enabled: true, size: "small", position: 1 },
    { id: "workers", name: "Worker Stats", type: "stats", enabled: true, size: "small", position: 2 },
    { id: "activity", name: "Activity Feed", type: "feed", enabled: true, size: "medium", position: 3 },
    { id: "pending", name: "Pending Actions", type: "table", enabled: true, size: "medium", position: 4 },
    { id: "geography", name: "Geography Map", type: "chart", enabled: false, size: "large", position: 5 },
    { id: "retention", name: "Retention Cohorts", type: "table", enabled: false, size: "large", position: 6 },
  ]);

  const [isEditing, setIsEditing] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  };

  const handleSizeChange = (id: string, size: Widget["size"]) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, size } : w))
    );
  };

  const handleDragStart = (id: string) => {
    setDraggedWidget(id);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedWidget || draggedWidget === targetId) return;

    setWidgets((prev) => {
      const items = [...prev];
      const draggedIdx = items.findIndex((w) => w.id === draggedWidget);
      const targetIdx = items.findIndex((w) => w.id === targetId);

      const [removed] = items.splice(draggedIdx, 1);
      items.splice(targetIdx, 0, removed);

      return items.map((w, i) => ({ ...w, position: i }));
    });
  };

  const handleDragEnd = () => {
    setDraggedWidget(null);
  };

  const handleSave = () => {
    // Save to localStorage or API
    localStorage.setItem("wa-admin-widgets", JSON.stringify(widgets));
    setIsEditing(false);
  };

  const handleReset = () => {
    // Reset to defaults
    setWidgets((prev) =>
      prev.map((w, i) => ({
        ...w,
        enabled: i < 5,
        position: i,
        size: i === 0 ? "large" : "small",
      }))
    );
  };

  const getTypeIcon = (type: Widget["type"]) => {
    switch (type) {
      case "chart":
        return "📊";
      case "table":
        return "📋";
      case "stats":
        return "📈";
      case "feed":
        return "📰";
    }
  };

  return (
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-gray-900">Dashboard Widgets</h3>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <Settings className="w-4 h-4" />
              Customize
            </button>
          )}
        </div>
      </div>

      {/* Widget list */}
      <div className="divide-y">
        {widgets.map((widget) => (
          <div
            key={widget.id}
            draggable={isEditing}
            onDragStart={() => handleDragStart(widget.id)}
            onDragOver={(e) => handleDragOver(e, widget.id)}
            onDragEnd={handleDragEnd}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors",
              isEditing && "cursor-move hover:bg-gray-50",
              draggedWidget === widget.id && "opacity-50"
            )}
          >
            {isEditing && (
              <GripVertical className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-lg">{getTypeIcon(widget.type)}</span>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{widget.name}</p>
              <p className="text-sm text-gray-500 capitalize">{widget.type}</p>
            </div>
            {isEditing && (
              <div className="flex items-center gap-2">
                <select
                  value={widget.size}
                  onChange={(e) => handleSizeChange(widget.id, e.target.value as Widget["size"])}
                  className="px-2 py-1 text-sm border border-gray-200 rounded-lg"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
                <button
                  onClick={() => handleToggle(widget.id)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    widget.enabled
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  )}
                >
                  {widget.enabled ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
            {!isEditing && (
              <div className={cn(
                "w-2 h-2 rounded-full",
                widget.enabled ? "bg-green-500" : "bg-gray-300"
              )} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

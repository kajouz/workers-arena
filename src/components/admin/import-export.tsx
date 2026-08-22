"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Upload, Download, FileText, CheckCircle, AlertTriangle, X } from "lucide-react";

export function ImportExport() {
  const [activeTab, setActiveTab] = useState<"import" | "export">("import");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [exportType, setExportType] = useState("workers");

  const handleImport = () => { if (!importFile) return; alert(`Importing ${importFile.name}...`); };
  const handleExport = () => { alert(`Exporting ${exportType}...`); };

  return (
    <div className="space-y-6">
      <div className="flex gap-4 border-b border-gray-200">
        <button onClick={() => setActiveTab("import")} className={cn("pb-3 px-1 text-sm font-medium border-b-2", activeTab === "import" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500")}><Upload className="w-4 h-4 inline mr-2" /> Import</button>
        <button onClick={() => setActiveTab("export")} className={cn("pb-3 px-1 text-sm font-medium border-b-2", activeTab === "export" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500")}><Download className="w-4 h-4 inline mr-2" /> Export</button>
      </div>
      {activeTab === "import" ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Import Data</h3>
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">Drag and drop a CSV file here, or click to browse</p>
            <input type="file" accept=".csv,.xlsx" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="hidden" id="import-file" />
            <label htmlFor="import-file" className="cursor-pointer text-blue-600 hover:text-blue-700">Choose file</label>
            {importFile && (
              <div className="mt-4 flex items-center justify-center gap-2"><FileText className="w-4 h-4 text-green-600" /><span className="text-sm text-gray-900">{importFile.name}</span><button onClick={() => setImportFile(null)}><X className="w-4 h-4 text-gray-400" /></button></div>
            )}
          </div>
          {importFile && <button onClick={handleImport} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Start Import</button>}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Export Data</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {["workers", "customers", "bookings", "payments", "reviews", "invoices", "categories", "campaigns"].map((type) => (
              <button key={type} onClick={() => setExportType(type)} className={cn("p-4 rounded-xl border-2 text-left transition-all", exportType === type ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")}>
                <FileText className="w-6 h-6 text-gray-600 mb-2" />
                <p className="font-medium text-gray-900 capitalize">{type}</p>
              </button>
            ))}
          </div>
          <button onClick={handleExport} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"><Download className="w-4 h-4" /> Export {exportType}</button>
        </div>
      )}
    </div>
  );
}

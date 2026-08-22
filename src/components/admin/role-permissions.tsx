"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Shield, Plus, Edit, Trash2, Users, CheckCircle, XCircle } from "lucide-react";

interface Role { id: string; name: string; description: string; userCount: number; permissions: string[]; }

const ALL_PERMISSIONS = ["users.view", "users.edit", "users.delete", "workers.view", "workers.approve", "workers.reject", "bookings.view", "bookings.manage", "payments.view", "payments.refund", "settings.view", "settings.edit", "reports.view", "reports.export", "cms.edit", "admin.access"];

export function RolePermissions() {
  const [roles] = useState<Role[]>([
    { id: "1", name: "Super Admin", description: "Full access to all features", userCount: 1, permissions: ALL_PERMISSIONS },
    { id: "2", name: "Support Agent", description: "Handle customer support tickets", userCount: 3, permissions: ["users.view", "workers.view", "bookings.view", "bookings.manage"] },
    { id: "3", name: "Finance Manager", description: "Manage payments and financials", userCount: 2, permissions: ["users.view", "workers.view", "bookings.view", "payments.view", "payments.refund", "reports.view", "reports.export"] },
    { id: "4", name: "Marketing", description: "Manage campaigns and content", userCount: 2, permissions: ["users.view", "workers.view", "cms.edit", "reports.view"] },
  ]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Roles & Permissions</h3><button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Role</button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {roles.map((role) => (
          <div key={role.id} onClick={() => setSelectedRole(role)} className={cn("bg-white rounded-xl border-2 p-4 cursor-pointer transition-all", selectedRole?.id === role.id ? "border-blue-500" : "border-gray-200 hover:border-gray-300")}>
            <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-purple-100 rounded-lg"><Shield className="w-5 h-5 text-purple-600" /></div><div><p className="font-medium text-gray-900">{role.name}</p><p className="text-sm text-gray-500">{role.userCount} users</p></div></div>
            <p className="text-sm text-gray-600 mb-3">{role.description}</p>
            <div className="flex flex-wrap gap-1">{role.permissions.slice(0, 3).map((p) => <span key={p} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{p.split(".")[0]}</span>)}{role.permissions.length > 3 && <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">+{role.permissions.length - 3}</span>}</div>
          </div>
        ))}
      </div>
      {selectedRole && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-4">Permissions: {selectedRole.name}</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ALL_PERMISSIONS.map((perm) => (
              <label key={perm} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50">
                <input type="checkbox" checked={selectedRole.permissions.includes(perm)} readOnly className="rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700">{perm}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

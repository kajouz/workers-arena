"use client";

import { useState } from "react";
import { 
  CheckCircle, 
  XCircle, 
  FileText, 
  Image, 
  ChevronRight,
  Clock,
  AlertTriangle,
  User,
  Briefcase,
  Star
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VerificationDocument {
  id: string;
  type: "id" | "certificate" | "portfolio" | "license";
  name: string;
  url: string;
  uploadedAt: Date;
  status: "pending" | "approved" | "rejected";
}

interface VerificationRequest {
  id: string;
  workerName: string;
  workerNameAr: string;
  category: string;
  submittedAt: Date;
  status: "pending" | "in_review" | "approved" | "rejected";
  documents: VerificationDocument[];
  notes?: string;
  reviewer?: string;
}

interface VerificationWorkflowProps {
  className?: string;
}

/**
 * Worker Verification Workflow component
 * Step-by-step review with document viewer
 */
export function VerificationWorkflow({ className }: VerificationWorkflowProps) {
  const [requests, setRequests] = useState<VerificationRequest[]>([
    {
      id: "v1",
      workerName: "Ahmed Al-Rashid",
      workerNameAr: "أحمد الراشد",
      category: "Plumbing",
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      status: "pending",
      documents: [
        { id: "d1", type: "id", name: "National ID", url: "#", uploadedAt: new Date(), status: "pending" },
        { id: "d2", type: "certificate", name: "Plumbing Certificate", url: "#", uploadedAt: new Date(), status: "pending" },
        { id: "d3", type: "portfolio", name: "Portfolio Image 1", url: "#", uploadedAt: new Date(), status: "pending" },
      ],
    },
    {
      id: "v2",
      workerName: "Mohammed Hassan",
      workerNameAr: "محمد حسن",
      category: "Electrical",
      submittedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      status: "in_review",
      documents: [
        { id: "d4", type: "id", name: "National ID", url: "#", uploadedAt: new Date(), status: "approved" },
        { id: "d5", type: "license", name: "Electrical License", url: "#", uploadedAt: new Date(), status: "pending" },
      ],
      reviewer: "Admin User",
    },
  ]);

  const [selectedRequest, setSelectedRequest] = useState<VerificationRequest | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [actionNotes, setActionNotes] = useState("");

  const steps = [
    { label: "Review Documents", icon: <FileText className="w-5 h-5" /> },
    { label: "Verify Identity", icon: <User className="w-5 h-5" /> },
    { label: "Check Credentials", icon: <Briefcase className="w-5 h-5" /> },
    { label: "Make Decision", icon: <CheckCircle className="w-5 h-5" /> },
  ];

  const handleApprove = async (requestId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId ? { ...r, status: "approved" as const } : r
      )
    );
    setSelectedRequest(null);
    setCurrentStep(0);
  };

  const handleReject = async (requestId: string, reason: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: "rejected" as const, notes: reason }
          : r
      )
    );
    setSelectedRequest(null);
    setCurrentStep(0);
    setActionNotes("");
  };

  const handleRequestReview = async (requestId: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, status: "in_review" as const, reviewer: "Admin User" }
          : r
      )
    );
  };

  const getStatusColor = (status: VerificationRequest["status"]) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-700";
      case "in_review":
        return "bg-blue-100 text-blue-700";
      case "approved":
        return "bg-green-100 text-green-700";
      case "rejected":
        return "bg-red-100 text-red-700";
    }
  };

  const getDocumentIcon = (type: VerificationDocument["type"]) => {
    switch (type) {
      case "id":
        return <User className="w-4 h-4" />;
      case "certificate":
        return <Star className="w-4 h-4" />;
      case "portfolio":
        return <Image className="w-4 h-4" />;
      case "license":
        return <FileText className="w-4 h-4" />;
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Verification Queue</h3>
        </div>
        {pendingCount > 0 && (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Requests list / Detail view */}
      {selectedRequest ? (
        <div className="p-4">
          {/* Back button */}
          <button
            onClick={() => {
              setSelectedRequest(null);
              setCurrentStep(0);
            }}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to queue
          </button>

          {/* Worker info */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-lg font-bold text-gray-600">
                {selectedRequest.workerName.charAt(0)}
              </span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">{selectedRequest.workerName}</p>
              <p className="text-sm text-gray-500">{selectedRequest.workerNameAr}</p>
              <p className="text-sm text-gray-500">{selectedRequest.category}</p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="flex items-center justify-between mb-6">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-full",
                    index <= currentStep
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  )}
                >
                  {index < currentStep ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-12 h-1 mx-2",
                      index < currentStep ? "bg-blue-600" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="mb-4">
            <h4 className="font-medium text-gray-900 mb-2">
              {steps[currentStep].label}
            </h4>

            {currentStep === 0 && (
              <div className="space-y-2">
                {selectedRequest.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {getDocumentIcon(doc.type)}
                      <div>
                        <p className="font-medium text-gray-900">{doc.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{doc.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200">
                        View
                      </button>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs font-medium rounded-full",
                          doc.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : doc.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        )}
                      >
                        {doc.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {currentStep === 1 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-600">
                  Verify the worker&apos;s identity by comparing the ID document with their profile photo and information.
                </p>
              </div>
            )}

            {currentStep === 2 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-600">
                  Check the validity of certificates and licenses. Ensure they are current and match the worker&apos;s claimed expertise.
                </p>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Add any notes about this verification..."
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(selectedRequest.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(selectedRequest.id, actionNotes)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {currentStep < steps.length - 1 && (
              <button
                onClick={() => setCurrentStep((prev) => prev + 1)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Next
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y max-h-[400px] overflow-y-auto">
          {requests.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="w-8 h-8 mx-auto text-green-500" />
              <p className="mt-2 font-medium text-green-700">All caught up!</p>
              <p className="text-sm">No pending verifications</p>
            </div>
          ) : (
            requests.map((request) => (
              <div
                key={request.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedRequest(request)}
              >
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="font-bold text-gray-600">
                    {request.workerName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{request.workerName}</p>
                  <p className="text-sm text-gray-500">{request.category}</p>
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "inline-block px-2 py-0.5 text-xs font-medium rounded-full",
                      getStatusColor(request.status)
                    )}
                  >
                    {request.status.replace("_", " ")}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {request.documents.length} docs
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

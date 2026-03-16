import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatDateTime } from "@/lib/utils";
import {
  MessageSquare,
  HelpCircle,
  Plus,
  Send,
  ChevronDown,
  ChevronRight,
  X,
  Pencil,
  Trash2,
  Save,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeedbackItem {
  id: string;
  userId: string;
  subdivisionId: string | null;
  category: string;
  message: string;
  status: string;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

interface FaqItem {
  id: string;
  subdivisionId: string | null;
  question: string;
  answer: string;
  category: string | null;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FEEDBACK_CATEGORIES = [
  "general",
  "bug-report",
  "feature-request",
  "complaint",
  "suggestion",
];

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "open":
      return "outline" as const;
    case "in-progress":
      return "warning" as const;
    case "resolved":
      return "success" as const;
    default:
      return "outline" as const;
  }
};

// ─── Component ──────────────────────────────────────────────────────────────

export function FeedbackPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"feedback" | "faqs">("feedback");

  // ─── Feedback state ─────────────────────────────────────────────────────

  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    category: "general",
    message: "",
  });
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);

  // ─── FAQ state ──────────────────────────────────────────────────────────

  const [showFaqForm, setShowFaqForm] = useState(false);
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null);
  const [faqForm, setFaqForm] = useState({
    question: "",
    answer: "",
    category: "general",
  });
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  // ─── Queries ────────────────────────────────────────────────────────────

  const { data: feedbackResponse, isLoading: feedbackLoading } = useQuery({
    queryKey: ["feedback"],
    queryFn: async () => {
      const res = await api.get("/feedback/feedback?limit=100");
      return res.data;
    },
    enabled: activeTab === "feedback",
  });

  const { data: faqsResponse, isLoading: faqsLoading } = useQuery({
    queryKey: ["faqs"],
    queryFn: async () => {
      const res = await api.get("/feedback/faqs");
      return res.data;
    },
    enabled: activeTab === "faqs",
  });

  const feedbackItems: FeedbackItem[] = feedbackResponse?.data ?? [];
  const faqItems: FaqItem[] = faqsResponse?.data ?? [];

  // ─── Mutations ──────────────────────────────────────────────────────────

  const createFeedbackMutation = useMutation({
    mutationFn: async (data: { category: string; message: string }) => {
      const res = await api.post("/feedback/feedback", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      setShowFeedbackForm(false);
      setFeedbackForm({ category: "general", message: "" });
    },
  });

  const replyFeedbackMutation = useMutation({
    mutationFn: async ({
      id,
      adminReply,
    }: {
      id: string;
      adminReply: string;
    }) => {
      const res = await api.put(`/feedback/feedback/${id}/reply`, {
        adminReply,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feedback"] });
      setReplyingTo(null);
      setReplyText("");
    },
  });

  const createFaqMutation = useMutation({
    mutationFn: async (data: {
      question: string;
      answer: string;
      category?: string;
    }) => {
      const res = await api.post("/feedback/faqs", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setShowFaqForm(false);
      setFaqForm({ question: "", answer: "", category: "general" });
    },
  });

  const updateFaqMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: { question?: string; answer?: string; category?: string };
    }) => {
      const res = await api.put(`/feedback/faqs/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setEditingFaqId(null);
      setFaqForm({ question: "", answer: "", category: "general" });
    },
  });

  const deleteFaqMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/feedback/faqs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    createFeedbackMutation.mutate(feedbackForm);
  };

  const handleSubmitReply = (id: string) => {
    if (!replyText.trim()) return;
    replyFeedbackMutation.mutate({ id, adminReply: replyText });
  };

  const handleSubmitFaq = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingFaqId) {
      updateFaqMutation.mutate({ id: editingFaqId, data: faqForm });
    } else {
      createFaqMutation.mutate(faqForm);
    }
  };

  const startEditFaq = (faq: FaqItem) => {
    setEditingFaqId(faq.id);
    setFaqForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category ?? "general",
    });
    setShowFaqForm(true);
  };

  const cancelFaqForm = () => {
    setShowFaqForm(false);
    setEditingFaqId(null);
    setFaqForm({ question: "", answer: "", category: "general" });
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Feedback & FAQs
        </h1>
        <p className="text-muted-foreground">
          Submit feedback, view responses, and browse frequently asked
          questions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab("feedback")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "feedback"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Feedback
        </button>
        <button
          onClick={() => setActiveTab("faqs")}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            activeTab === "faqs"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <HelpCircle className="h-4 w-4" />
          FAQs
        </button>
      </div>

      {/* ─── Feedback Tab ──────────────────────────────────────────────── */}
      {activeTab === "feedback" && (
        <div className="space-y-4">
          {/* Submit Feedback Button */}
          <div className="flex justify-end">
            <Button onClick={() => setShowFeedbackForm(!showFeedbackForm)}>
              {showFeedbackForm ? (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Submit Feedback
                </>
              )}
            </Button>
          </div>

          {/* New Feedback Form */}
          {showFeedbackForm && (
            <Card>
              <CardHeader>
                <CardTitle>New Feedback</CardTitle>
                <CardDescription>
                  Share your thoughts, report an issue, or suggest improvements.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <select
                      value={feedbackForm.category}
                      onChange={(e) =>
                        setFeedbackForm({
                          ...feedbackForm,
                          category: e.target.value,
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {FEEDBACK_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat
                            .split("-")
                            .map(
                              (w) => w.charAt(0).toUpperCase() + w.slice(1)
                            )
                            .join(" ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Message</label>
                    <textarea
                      value={feedbackForm.message}
                      onChange={(e) =>
                        setFeedbackForm({
                          ...feedbackForm,
                          message: e.target.value,
                        })
                      }
                      required
                      rows={4}
                      placeholder="Describe your feedback in detail..."
                      className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={createFeedbackMutation.isPending}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {createFeedbackMutation.isPending
                        ? "Submitting..."
                        : "Submit"}
                    </Button>
                  </div>
                  {createFeedbackMutation.isError && (
                    <p className="text-sm text-destructive">
                      Failed to submit feedback. Please try again.
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          )}

          {/* Feedback List */}
          <Card>
            <CardHeader>
              <CardTitle>All Feedback</CardTitle>
              <CardDescription>
                {isAdmin
                  ? "View and respond to all feedback submissions."
                  : "View your submitted feedback and responses."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {feedbackLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : feedbackItems.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">
                    No feedback submitted yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {feedbackItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border"
                    >
                      {/* Feedback Header */}
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() =>
                          setExpandedFeedback(
                            expandedFeedback === item.id ? null : item.id
                          )
                        }
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {expandedFeedback === item.id ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="capitalize">
                                {item.category.split("-").join(" ")}
                              </Badge>
                              <Badge
                                variant={statusBadgeVariant(item.status)}
                                className="capitalize"
                              >
                                {item.status}
                              </Badge>
                              {isAdmin && item.userName && (
                                <span className="text-xs text-muted-foreground">
                                  by {item.userName}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm truncate">
                              {item.message}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                          {formatDateTime(item.createdAt)}
                        </span>
                      </div>

                      {/* Expanded Content */}
                      {expandedFeedback === item.id && (
                        <div className="border-t border-border p-4 space-y-4 bg-muted/10">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                              Full Message
                            </p>
                            <p className="text-sm whitespace-pre-wrap">
                              {item.message}
                            </p>
                          </div>

                          {item.adminReply && (
                            <div className="rounded-md bg-primary/5 border border-primary/20 p-3">
                              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
                                Admin Reply
                              </p>
                              <p className="text-sm whitespace-pre-wrap">
                                {item.adminReply}
                              </p>
                              {item.repliedAt && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Replied {formatDateTime(item.repliedAt)}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Admin Reply Form */}
                          {isAdmin && !item.adminReply && (
                            <div>
                              {replyingTo === item.id ? (
                                <div className="space-y-3">
                                  <textarea
                                    value={replyText}
                                    onChange={(e) =>
                                      setReplyText(e.target.value)
                                    }
                                    rows={3}
                                    placeholder="Write your reply..."
                                    className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleSubmitReply(item.id)
                                      }
                                      disabled={
                                        replyFeedbackMutation.isPending
                                      }
                                    >
                                      <Send className="mr-2 h-3 w-3" />
                                      {replyFeedbackMutation.isPending
                                        ? "Sending..."
                                        : "Send Reply"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setReplyingTo(null);
                                        setReplyText("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReplyingTo(item.id)}
                                >
                                  <MessageSquare className="mr-2 h-3 w-3" />
                                  Reply
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── FAQs Tab ──────────────────────────────────────────────────── */}
      {activeTab === "faqs" && (
        <div className="space-y-4">
          {/* Add FAQ Button (Admin Only) */}
          {isAdmin && (
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  if (showFaqForm) {
                    cancelFaqForm();
                  } else {
                    setShowFaqForm(true);
                  }
                }}
              >
                {showFaqForm ? (
                  <>
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Add FAQ
                  </>
                )}
              </Button>
            </div>
          )}

          {/* FAQ Form (Admin Only) */}
          {showFaqForm && isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingFaqId ? "Edit FAQ" : "New FAQ"}
                </CardTitle>
                <CardDescription>
                  {editingFaqId
                    ? "Update the question and answer."
                    : "Add a new frequently asked question."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitFaq} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Category</label>
                    <Input
                      value={faqForm.category}
                      onChange={(e) =>
                        setFaqForm({ ...faqForm, category: e.target.value })
                      }
                      placeholder="e.g., general, billing, technical"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Question</label>
                    <Input
                      value={faqForm.question}
                      onChange={(e) =>
                        setFaqForm({ ...faqForm, question: e.target.value })
                      }
                      required
                      placeholder="Enter the question..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Answer</label>
                    <textarea
                      value={faqForm.answer}
                      onChange={(e) =>
                        setFaqForm({ ...faqForm, answer: e.target.value })
                      }
                      required
                      rows={4}
                      placeholder="Enter the answer..."
                      className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelFaqForm}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        createFaqMutation.isPending ||
                        updateFaqMutation.isPending
                      }
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {createFaqMutation.isPending ||
                      updateFaqMutation.isPending
                        ? "Saving..."
                        : editingFaqId
                          ? "Update FAQ"
                          : "Create FAQ"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* FAQ List */}
          <Card>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
              <CardDescription>
                Click a question to reveal its answer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {faqsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : faqItems.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-muted-foreground">
                    No FAQs available yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {faqItems.map((faq) => (
                    <div
                      key={faq.id}
                      className="rounded-lg border border-border"
                    >
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() =>
                          setExpandedFaq(
                            expandedFaq === faq.id ? null : faq.id
                          )
                        }
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {expandedFaq === faq.id ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {faq.category && (
                                <Badge variant="outline" className="capitalize text-xs">
                                  {faq.category}
                                </Badge>
                              )}
                              {isAdmin && !faq.isPublished && (
                                <Badge variant="warning" className="text-xs">
                                  Draft
                                </Badge>
                              )}
                            </div>
                            <p className="mt-1 text-sm font-medium">
                              {faq.question}
                            </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1 ml-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditFaq(faq);
                              }}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              title="Edit FAQ"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  confirm(
                                    "Are you sure you want to delete this FAQ?"
                                  )
                                ) {
                                  deleteFaqMutation.mutate(faq.id);
                                }
                              }}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                              title="Delete FAQ"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                      {expandedFaq === faq.id && (
                        <div className="border-t border-border p-4 bg-muted/10">
                          <p className="text-sm whitespace-pre-wrap">
                            {faq.answer}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

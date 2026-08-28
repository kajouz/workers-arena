"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Smile, Paperclip, Phone, Video, MoreVertical, Check, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  read: boolean;
  type: "text" | "image" | "file";
}

interface ChatParticipant {
  id: string;
  name: string;
  avatar?: string;
  role: "worker" | "customer";
  online: boolean;
}

interface ChatWindowProps {
  messages: Message[];
  currentUserId: string;
  participant: ChatParticipant;
  onSendMessage: (text: string) => void;
  onTyping?: () => void;
  isTyping?: boolean;
}

/**
 * Real-time messaging chat window
 */
export function ChatWindow({
  messages,
  currentUserId,
  participant,
  onSendMessage,
  onTyping,
  isTyping,
}: ChatWindowProps) {
  const { locale } = useLocale();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isArabic = locale === "ar";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
    inputRef.current?.focus();
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString(locale === "ar" ? "ar-LB" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const messageDate = new Date(date);

    if (
      messageDate.getDate() === today.getDate() &&
      messageDate.getMonth() === today.getMonth() &&
      messageDate.getFullYear() === today.getFullYear()
    ) {
      return isArabic ? "اليوم" : "Today";
    }

    return messageDate.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Group messages by date
  const groupedMessages = messages.reduce<{ date: string; messages: Message[] }[]>((groups, msg) => {
    const dateKey = new Date(msg.timestamp).toISOString().split("T")[0];
    const existing = groups.find((g) => g.date === dateKey);
    if (existing) {
      existing.messages.push(msg);
    } else {
      groups.push({ date: dateKey, messages: [msg] });
    }
    return groups;
  }, []);

  return (
    <div className="flex h-[600px] flex-col rounded-2xl border border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
        <div className="relative">
          <Avatar className="size-10">
            <AvatarFallback>{participant.name.charAt(0)}</AvatarFallback>
          </Avatar>
          {participant.online && (
            <span className="absolute bottom-0 end-0 size-3 rounded-full border-2 border-white bg-emerald-500 dark:border-ink-900" />
          )}
        </div>
        <div className="flex-1">
          <p className="font-bold text-ink-900 dark:text-ink-50">{participant.name}</p>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {participant.online
              ? isArabic ? "متصل الآن" : "Online now"
              : isArabic ? "غير متصل" : "Offline"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm">
            <Phone className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm">
            <Video className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm">
            <MoreVertical className="size-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {groupedMessages.map((group) => (
          <div key={group.date}>
            {/* Date separator */}
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-ink-100 dark:bg-ink-800" />
              <span className="text-[11px] font-bold text-ink-400">
                {formatDate(group.messages[0].timestamp)}
              </span>
              <div className="h-px flex-1 bg-ink-100 dark:bg-ink-800" />
            </div>

            {/* Messages */}
            {group.messages.map((message, i) => {
              const isOwn = message.senderId === currentUserId;
              const showAvatar =
                i === 0 || group.messages[i - 1].senderId !== message.senderId;

              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "mb-2 flex",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-end gap-2",
                      isOwn && "flex-row-reverse"
                    )}
                  >
                    {/* Avatar */}
                    {!isOwn && showAvatar && (
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {participant.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {!isOwn && !showAvatar && <div className="w-8" />}

                    {/* Bubble */}
                    <div
                      className={cn(
                        "max-w-[70%] rounded-2xl px-4 py-2.5",
                        isOwn
                          ? "bg-brand-700 text-white rounded-br-md"
                          : "bg-ink-100 text-ink-900 rounded-bl-md dark:bg-ink-800 dark:text-ink-50"
                      )}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                      <div
                        className={cn(
                          "mt-1 flex items-center gap-1",
                          isOwn ? "justify-end" : "justify-start"
                        )}
                      >
                        <span
                          className={cn(
                            "text-[10px]",
                            isOwn ? "text-white/70" : "text-ink-400"
                          )}
                        >
                          {formatTime(message.timestamp)}
                        </span>
                        {isOwn && (
                          message.read ? (
                            <CheckCheck className="size-3 text-white/70" />
                          ) : (
                            <Check className="size-3 text-white/70" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}

        {/* Typing indicator */}
        <AnimatePresence>
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-2"
            >
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">
                  {participant.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="rounded-2xl bg-ink-100 px-4 py-3 dark:bg-ink-800">
                <div className="flex gap-1">
                  <span className="size-2 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.3s]" />
                  <span className="size-2 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.15s]" />
                  <span className="size-2 animate-bounce rounded-full bg-ink-400" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-ink-100 px-4 py-3 dark:border-ink-800">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm">
            <Smile className="size-5 text-ink-400" />
          </Button>
          <Button variant="ghost" size="icon-sm">
            <Paperclip className="size-5 text-ink-400" />
          </Button>
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              onTyping?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isArabic ? "اكتب رسالة..." : "Type a message..."}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            size="icon"
            className="rounded-full"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Type declarations for optional @sentry/nextjs module
// This file suppresses TypeScript errors when @sentry/nextjs is not installed

declare module "@sentry/nextjs" {
  export function init(options: any): void;
  export function captureException(error: any, context?: any): string;
  export function captureMessage(message: string, level?: string): string;
  export function setUser(user: any): void;
  export function addBreadcrumb(breadcrumb: any): void;
  export function startSpan<T>(context: any, callback: (span: any) => T): T;
  export function flush(timeout?: number): Promise<boolean>;
}

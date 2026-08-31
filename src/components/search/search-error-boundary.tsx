"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SearchErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center dark:border-ink-800 dark:bg-ink-900">
            <p className="text-ink-600 dark:text-ink-300">
              Search encountered an issue. Please try again.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ArrowRight, Tag } from "lucide-react";
import { getBlogPosts, getFeaturedPosts, CONTENT_CATEGORIES } from "@/lib/content/content-service";

export const metadata: Metadata = {
  title: "Blog — WorkersArena",
  description: "Tips, guides, and news about finding and hiring professional workers in the MENA region.",
};

export default function BlogPage() {
  const posts = getBlogPosts();
  const featured = getFeaturedPosts();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl">
          Blog & Resources
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-500 dark:text-ink-400">
          Tips, guides, and news about finding and hiring professional workers.
        </p>
      </div>

      {/* Featured Post */}
      {featured.length > 0 && (
        <Link
          href={`/blog/${featured[0].slug}`}
          className="group mb-12 block overflow-hidden rounded-3xl border border-ink-100 bg-gradient-to-br from-brand-50 to-white p-8 transition-all hover:shadow-lift dark:border-ink-800 dark:from-brand-950/20 dark:to-ink-900 sm:p-12"
        >
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
            ★ Featured
          </span>
          <h2 className="text-2xl font-bold text-ink-900 dark:text-ink-50 group-hover:text-brand-600 dark:group-hover:text-brand-400 sm:text-3xl">
            {featured[0].title}
          </h2>
          <p className="mt-3 max-w-2xl text-ink-500 dark:text-ink-400">
            {featured[0].excerpt}
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-ink-400">
            <span className="flex items-center gap-1">
              <Clock className="size-4" />
              {featured[0].readingTime} min read
            </span>
            <span>{new Date(featured[0].publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
        </Link>
      )}

      {/* Categories */}
      <div className="mb-8 flex flex-wrap gap-2">
        {CONTENT_CATEGORIES.map((cat) => (
          <span
            key={cat.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300"
          >
            {cat.icon} {cat.name}
          </span>
        ))}
      </div>

      {/* Posts Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/blog/${post.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white transition-all hover:-translate-y-1 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
          >
            <div className="flex-1 p-6">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:bg-brand-950/30 dark:text-brand-400">
                  {CONTENT_CATEGORIES.find((c) => c.id === post.category)?.icon}{" "}
                  {CONTENT_CATEGORIES.find((c) => c.id === post.category)?.name}
                </span>
              </div>
              <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50 group-hover:text-brand-600 dark:group-hover:text-brand-400">
                {post.title}
              </h3>
              <p className="mt-2 line-clamp-2 text-sm text-ink-500 dark:text-ink-400">
                {post.excerpt}
              </p>
            </div>
            <div className="flex items-center justify-between border-t border-ink-100 px-6 py-3 dark:border-ink-800">
              <span className="flex items-center gap-1 text-xs text-ink-400">
                <Clock className="size-3" />
                {post.readingTime} min
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-brand-600 group-hover:gap-2 dark:text-brand-400">
                Read <ArrowRight className="size-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

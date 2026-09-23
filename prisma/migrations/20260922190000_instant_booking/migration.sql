-- §Instant booking (src/lib/data/instant-book.ts) — demand-first growth: a
-- worker opts in to selling a published fixed price without a request/response
-- round-trip, and a service item can be marked as that fixed-price package.
--
-- Both default to false, so every existing row keeps today's behaviour: the
-- booking flow stays a negotiation until a worker explicitly opts in and
-- publishes a per-job price.

ALTER TABLE "Worker" ADD COLUMN "instantBook" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ServiceItem" ADD COLUMN "fixedPrice" BOOLEAN NOT NULL DEFAULT false;

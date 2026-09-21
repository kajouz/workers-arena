"use client";

import { createContext, useCallback, useContext } from "react";

/**
 * The guest credential for the /bookings page.
 *
 * A signed-out customer reaches their bookings via /bookings?phone=… — that
 * phone is the only thing identifying them. The server actions behind the page
 * now resolve the caller before mutating anything (src/lib/data/authz.ts), so
 * a guest has to present the same phone on WRITES that already unlocked the
 * READ. This context carries it from the page down to the row components
 * without threading a prop through every card.
 *
 * Signed-in customers leave it undefined: their session is the credential and
 * the authz seam prefers it.
 */
const GuestProofContext = createContext<string | undefined>(undefined);

export function GuestProofProvider({
  phone,
  children,
}: {
  phone?: string;
  children: React.ReactNode;
}) {
  return <GuestProofContext.Provider value={phone}>{children}</GuestProofContext.Provider>;
}

/**
 * Returns a function that stamps the guest credential onto an action's
 * FormData. Call it on every FormData handed to a booking mutation:
 *
 *     const withGuestProof = useGuestProof();
 *     await cancelBookingAction(booking.id, withGuestProof(f));
 *
 * A no-op for signed-in customers, so call sites never branch.
 */
export function useGuestProof(): (formData: FormData) => FormData {
  const phone = useContext(GuestProofContext);
  return useCallback(
    (formData: FormData) => {
      if (phone) formData.set("guestPhone", phone);
      return formData;
    },
    [phone]
  );
}

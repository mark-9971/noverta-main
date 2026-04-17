/**
 * CLERK SIGN-OUT SNIPPET — AppLayout.tsx (restore reference)
 *
 * In src/components/layout/AppLayout.tsx, restore these changes:
 *
 * 1. Add to imports at top:
 *      import { useClerk } from "@clerk/react";
 *
 * 2. In AppLayout function body, replace:
 *      const [location, setLocation] = useLocation();
 *      ...
 *      function signOut() {
 *        localStorage.removeItem("trellis_session");
 *        localStorage.removeItem("trellis_role");
 *        setLocation("/sign-in");
 *      }
 *
 *    With:
 *      const [location] = useLocation();
 *      const { signOut } = useClerk();
 *
 * 3. The sign-out button call changes from:
 *      onClick={signOut}
 *    To:
 *      onClick={() => signOut({ redirectUrl: "/sign-in" })}
 */

// No executable code here — this is a reference snippet only.
export {};

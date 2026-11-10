/**
 * Hover lift of a Visual card (`lift`: translateY(−2 px) + shadow, 0.18 s);
 * keyboard focus inside the card (its link or button) lifts it the same way.
 * Only for cards that hold a link or a button (no fake affordance). Static
 * under reduced motion.
 */
export const LIFT_CLASS = "lift motion-safe:focus-within:[transform:translateY(-2px)]";

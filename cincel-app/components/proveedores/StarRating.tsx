"use client";

import { useState } from "react";

/**
 * Five-star rating widget with hover preview.
 *
 * Uses plain <button> elements, not shadcn Button: each star is a bare
 * glyph (★) with no padding/border/background, styled only by text color.
 * Button's default sizing (h-10 px-4 py-2, or any size variant) would need
 * to be fully negated to reproduce this, providing no benefit over a plain
 * button with a className reset.
 */
export const StarRating = ({ rating, onRate }: { rating: number; onRate: (v: number) => void }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRate(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className={`text-base leading-none transition-colors ${star <= (hover || rating) ? "text-foreground" : "text-muted-foreground/30"}`}
        >★</button>
      ))}
    </div>
  );
};

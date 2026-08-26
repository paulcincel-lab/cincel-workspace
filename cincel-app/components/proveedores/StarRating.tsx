"use client";

import { useState } from "react";

/** Five-star rating widget with hover preview. */
export const StarRating = ({ rating, onRate }: { rating: number; onRate: (v: number) => void }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onRate(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className={`text-base leading-none transition-colors ${star <= (hover || rating) ? "text-orange-400" : "text-gray-200"}`}
        >★</button>
      ))}
    </div>
  );
};

import React from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  rating: number; // admite 0-5, puede ser decimal
  interactive?: boolean;
  onChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
}

export const StarRating: React.FC<StarRatingProps> = ({
  rating,
  interactive = false,
  onChange,
  size = 'md',
}) => {
  const [hoverRating, setHoverRating] = React.useState<number | null>(null);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-8 h-8',
  };

  const handleClick = (value: number) => {
    if (interactive && onChange) {
      onChange(value);
    }
  };

  // Aseguramos rango 0-5 y usamos hover si existe
  const effectiveRating = Math.max(0, Math.min(5, hoverRating ?? rating));

  return (
    <div
      className="flex gap-1"
      onMouseLeave={() => interactive && setHoverRating(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = effectiveRating >= star;
        const colorClass = fill
          ? 'text-yellow-400 fill-yellow-400'
          : 'text-slate-300';

        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => handleClick(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
            className={
              interactive
                ? 'cursor-pointer hover:scale-110 transition-transform'
                : 'cursor-default'
            }
          >
            <Star className={`${sizeClasses[size]} ${colorClass}`} />
          </button>
        );
      })}
    </div>
  );
};

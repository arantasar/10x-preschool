import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default scale. Without these keys it
// reads `text-display-xl` or `text-title` (sizes from the "Ogród" `@theme` in
// `global.css`) as a text *colour*, and `cn("text-display-xl text-las")` drops
// the size. Keep this list in step with the `@theme` block.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display-xl", "display-lg", "display-md", "display-sm", "title", "lead"],
      shadow: ["card", "panel", "input"],
      radius: ["input", "row", "card", "panel", "logo", "blob-a", "blob-b"],
      spacing: ["gutter"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

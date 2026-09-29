import { Eye, EyeOff } from "lucide-react";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-las-szary hover:text-las focus-visible:outline-morela absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:outline-3 focus-visible:outline-solid"
      aria-label={visible ? "Ukryj hasło" : "Pokaż hasło"}
    >
      {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}

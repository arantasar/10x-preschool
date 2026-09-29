import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const inputBase =
  "h-14 w-full rounded-input border bg-mleko px-4 text-[17px] text-las shadow-input placeholder:text-las-szary/70 transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-las focus-visible:shadow-[0_0_0_2px_var(--color-morela)] focus-visible:outline-solid";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  endContent,
}: FormFieldProps) {
  const describedBy = error || hint ? `${id}-note` : undefined;

  return (
    <div>
      <label htmlFor={id} className="text-las mb-2 block text-[15px] font-extrabold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(inputBase, error ? "border-red-700" : "border-obrys-przerywany", endContent && "pr-14")}
        />
        {endContent}
      </div>
      {error ? (
        <p id={describedBy} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-800">
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="text-las-szary mt-1.5 text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="rounded-input flex items-center gap-2 border border-red-300 bg-red-50 px-4 py-3 text-[15px] font-semibold text-red-800">
      <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  );
}

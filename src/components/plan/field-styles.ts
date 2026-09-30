/**
 * The planner's form fields, in the look of `auth/FormField.tsx`: Mleko, the
 * `obrys-przerywany` border, the `input` radius and the "Ogród" focus pair.
 * Shared by the week and the day islands so the two panels cannot drift apart.
 */
export const FIELD_LABEL = "text-las mb-2 block text-[15px] font-extrabold";

export const FIELD_BASE =
  "w-full rounded-input border bg-mleko px-4 py-3 text-[17px] text-las placeholder:text-las-szary/70 transition-colors disabled:opacity-60 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-las focus-visible:shadow-[0_0_0_2px_var(--color-morela)] focus-visible:outline-solid";

export const FIELD_BORDER = "border-obrys-przerywany";
export const FIELD_BORDER_ERROR = "border-blad";

/** The line under a field that says what is wrong with it. */
export const FIELD_ERROR = "text-blad flex items-center gap-1.5 text-sm font-bold";

import { forwardRef, type InputHTMLAttributes, type Ref } from "react";

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

// Canonical search field. Presentation only: consumers own state, filtering,
// and submission. className should carry layout and width only.
export const SearchInput = forwardRef(function SearchInput(
  { className, type = "search", ...props }: SearchInputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={joinClasses(
        "block h-12 w-full rounded-full border-0 bg-zinc-100 px-4 text-sm text-zinc-950 placeholder:text-zinc-500 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

import { forwardRef, type InputHTMLAttributes, type Ref } from "react";

type SearchInputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export const SearchInput = forwardRef(function SearchInput(
  { className, type = "text", ...props }: SearchInputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={joinClasses(
        "block h-12 w-full rounded-full border border-zinc-300 bg-white px-4 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950",
        className,
      )}
      {...props}
    />
  );
});

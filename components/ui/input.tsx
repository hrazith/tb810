import { forwardRef, type InputHTMLAttributes, type Ref } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  className?: string;
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export const Input = forwardRef(function Input(
  { className, type = "text", ...props }: InputProps,
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={joinClasses(
        "block h-12 w-full rounded-md border-0 bg-zinc-100 px-4 text-base text-zinc-950 placeholder:text-zinc-400 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:focus-visible:ring-red-500 aria-invalid:focus-visible:ring-offset-red-50",
        className,
      )}
      {...props}
    />
  );
});

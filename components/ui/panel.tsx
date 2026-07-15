import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type PanelPadding = "compact" | "default" | "spacious";

type PanelProps<T extends ElementType = "div"> = {
  as?: T;
  padding?: PanelPadding;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

const paddingClasses: Record<PanelPadding, string> = {
  compact: "p-4 md:p-5",
  default: "p-6 md:p-8",
  spacious: "p-8 md:p-12 lg:p-16",
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export function Panel<T extends ElementType = "div">({
  as,
  padding = "default",
  className,
  children,
  ...props
}: PanelProps<T>) {
  const Component = as ?? "div";

  return (
    <Component
      className={joinClasses(
        "rounded-2xl border border-zinc-200 bg-white shadow-sm",
        paddingClasses[padding],
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

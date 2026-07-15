import {
  cloneElement,
  isValidElement,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "ghost"
  | "link"
  | "icon";

type ButtonSize = "sm" | "md" | "lg";

type ButtonShape = "default" | "pill";

type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButtonProps = ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: false;
  };

type ButtonAsChildProps = ButtonBaseProps & {
  asChild: true;
  children: ReactElement;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children">;

export type ButtonProps = ButtonAsButtonProps | ButtonAsChildProps;

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-zinc-950 bg-zinc-950 text-white shadow-sm hover:border-zinc-800 hover:bg-zinc-800 focus-visible:outline-zinc-950 disabled:border-zinc-300 disabled:bg-zinc-300 disabled:text-zinc-500",

  secondary:
    "border-zinc-300 bg-white text-zinc-900 shadow-sm hover:border-zinc-950 hover:text-zinc-950 focus-visible:outline-zinc-950 disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400",

  destructive:
    "border-red-600 bg-red-600 text-white shadow-sm hover:border-red-700 hover:bg-red-700 focus-visible:outline-red-600 disabled:border-red-200 disabled:bg-red-200 disabled:text-red-500",

  ghost:
    "border-transparent bg-transparent text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-zinc-950 disabled:text-zinc-400",

  link:
    "border-transparent bg-transparent px-0 text-zinc-950 underline-offset-4 hover:underline focus-visible:outline-zinc-950 disabled:text-zinc-400",

  icon:
    "border-zinc-300 bg-white text-zinc-700 shadow-sm hover:border-zinc-950 hover:text-zinc-950 focus-visible:outline-zinc-950 disabled:border-zinc-200 disabled:bg-zinc-50 disabled:text-zinc-400",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "px-12 py-3 text-base",
  lg: "h-12 px-6 text-base",
};

const shapeClasses: Record<ButtonShape, string> = {
  default: "rounded-xl",
  pill: "rounded-full",
};

function joinClasses(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function getButtonClasses({
  variant,
  size,
  shape,
  className,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  shape: ButtonShape;
  className?: string;
}) {
  return joinClasses(
    "inline-flex items-center justify-center gap-2 border font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    shapeClasses[shape],
    className,
  );
}

export function Button(props: ButtonProps) {
  if ("asChild" in props && props.asChild) {
    const {
      asChild: _asChild,
      variant = "primary",
      size = "md",
      shape = "default",
      className,
      children,
      ...rest
    } = props;

    if (!isValidElement(children)) {
      throw new Error("Button with asChild expects a single element child.");
    }

    const childClassName = (
      children.props as {
        className?: string;
      }
    ).className;

    const buttonClasses = getButtonClasses({
      variant,
      size,
      shape,
      className,
    });

    return cloneElement(children, {
      ...rest,
      className: joinClasses(buttonClasses, childClassName),
    } as never);
  }

  const {
    variant = "primary",
    size = "md",
    shape = "default",
    className,
    children,
    type = "button",
    ...rest
  } = props;

  const buttonClasses = getButtonClasses({
    variant,
    size,
    shape,
    className,
  });

  return (
    <button type={type} className={buttonClasses} {...rest}>
      {children}
    </button>
  );
}
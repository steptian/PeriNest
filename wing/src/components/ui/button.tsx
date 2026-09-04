/** shadcn 风格 Button 最小实现 */
import { forwardRef } from "react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

const variants = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border border-input bg-background hover:bg-muted",
  ghost: "hover:bg-muted",
} as const;

const sizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
  lg: "h-11 px-8",
} as const;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={twMerge(
        clsx(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variants[variant], sizes[size], className
        )
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";

// src/components/UI.tsx
// Componentes UI base utilizados por PMSWizardView y otros componentes standalone
import React from "react";
import { cn } from "../utils";

// ── Card ──────────────────────────────────────────────────────────────────────

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border border-slate-800 bg-slate-900 shadow-sm",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

// ── Button ────────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg",
  ghost:   "bg-transparent hover:bg-slate-800 text-slate-400 hover:text-white",
  outline: "border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300",
  danger:  "bg-red-600 hover:bg-red-500 text-white",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg text-sm font-bold",
        "transition-all duration-200 px-4 py-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeVariant = "info" | "neutral" | "success" | "danger" | "warning";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  info:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  neutral: "bg-slate-800 text-slate-400 border-slate-700",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  danger:  "bg-red-500/10 text-red-400 border-red-500/20",
  warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border",
        "px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        BADGE_VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "icon";
type Size = "sm" | "md" | "lg";

type SharedProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
};

type ButtonProps = SharedProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled" | "className"> & {
  href?: undefined;
};

type LinkProps = SharedProps & {
  href: string;
  target?: string;
  rel?: string;
  title?: string;
  "aria-label"?: string;
  "aria-current"?: "page" | "step" | "location" | "date" | "time" | "true" | "false";
};

const sharedKeys = ["variant", "size", "loading", "disabled", "className", "children", "href"];

export function Button(props: ButtonProps | LinkProps) {
  const { variant = "secondary", size = "md", loading = false, disabled = false, className, children } = props;
  const classes = [styles.button, className].filter(Boolean).join(" ");
  const content = <>{loading && <span className={styles.spinner} aria-hidden="true" />}{children}</>;

  if ("href" in props && props.href) {
    if (disabled) {
      return <span className={classes} data-variant={variant} data-size={size} aria-disabled="true">{content}</span>;
    }
    return <Link className={classes} href={props.href} target={props.target} rel={props.rel} title={props.title} aria-label={props["aria-label"]} aria-current={props["aria-current"]} data-variant={variant} data-size={size}>{content}</Link>;
  }

  const rest = { ...props } as Record<string, unknown>;
  for (const key of sharedKeys) delete rest[key];
  return <button {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)} data-variant={variant} data-size={size} data-loading={loading || undefined} className={classes} disabled={disabled || loading}>{content}</button>;
}

export function ButtonLink(props: Omit<LinkProps, "href"> & { href: string }) {
  return <Button {...props} />;
}

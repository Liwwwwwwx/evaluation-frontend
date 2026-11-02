import Link from "next/link";
import type { ReactNode } from "react";
import { BackArrowIcon } from "./icons";
import styles from "./ui.module.css";

export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <Link className={[styles.backLink, className].filter(Boolean).join(" ")} href={href}><BackArrowIcon />{children}</Link>;
}

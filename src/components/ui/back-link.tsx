import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { BackArrowIcon } from "./icons";
import styles from "./ui.module.css";

export function BackLink({ href, children, className, onClick }: { href: string; children: ReactNode; className?: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  return <Link className={[styles.backLink, className].filter(Boolean).join(" ")} href={href} onClick={onClick}><BackArrowIcon />{children}</Link>;
}

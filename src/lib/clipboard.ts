/** Copy from a user action, including on HTTP origins without the Clipboard API. */
export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Permission can be denied even when the API is present; try the browser fallback.
    }
  }

  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.opacity = "0";
  // Native modal dialogs make elements outside the top layer inert.
  const parent = previous?.closest("dialog[open]") || document.querySelector("dialog[open]") || document.body;
  parent.appendChild(field);
  try {
    field.focus();
    field.select();
    if (!document.execCommand("copy")) throw new Error("copy unavailable");
  } finally {
    field.remove();
    previous?.focus();
  }
}

import { appIcon } from "@/server/og/app-icon";

// Icona per iOS (apple-touch-icon), 180×180.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180);
}

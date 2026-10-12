import { Link } from "react-router";
import { Plane } from "lucide-react";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Plane className="h-4 w-4" />
      </span>
      <span>Flight Price Notifier</span>
    </Link>
  );
}

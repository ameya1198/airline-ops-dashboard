"use client";

import Link from "next/link";
import { CircleHelp, Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = {
  view: "vp" | "occ";
  dataThrough: string;
  /** The page's filters, drawn in the same row between the title and the view switch. */
  children?: React.ReactNode;
};

export function DashboardHeader({ view, dataThrough, children }: Props) {
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 fit:flex-nowrap">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <Logo />
        <div className="min-w-0">
          <h1 className="flex items-center gap-1.5 text-xl leading-tight font-medium tracking-tight short:text-lg 2xl:text-2xl">
            American Airlines Operations Dashboard
            <Tooltip>
              <TooltipTrigger
                aria-label="About this dashboard"
                className="cursor-help rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Info className="size-3.5" aria-hidden />
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-xs leading-relaxed">
                Independent portfolio project using public BTS on-time data. Not
                affiliated with American Airlines. A replay of past operations
                that shows how a live tool would work.
              </TooltipContent>
            </Tooltip>
          </h1>
          <p className="font-mono text-[11px] text-muted-foreground 2xl:text-xs">
            Independent portfolio project · not affiliated with American Airlines · BTS data through {dataThrough}
          </p>
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            data-tour="help"
            aria-label="Take the tour"
            onClick={() => window.dispatchEvent(new Event("aa-tour:start"))}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <CircleHelp className="size-4" aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Take the tour</TooltipContent>
        </Tooltip>
        <nav
          aria-label="Dashboard view"
          className="inline-flex h-9 shrink-0 items-center rounded-lg border bg-card p-0.5 text-sm"
        >
          <ViewLink href="/" active={view === "vp"}>
            VP view
          </ViewLink>
          <ViewLink href="/occ" active={view === "occ"}>
            OCC view
          </ViewLink>
        </nav>
      </div>
    </header>
  );
}

function ViewLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** American Airlines Flight Symbol (full colour), from public/brand/aa-flight-symbol.svg. */
function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small static SVG; next/image adds nothing here
    <img
      src="/brand/aa-flight-symbol.svg"
      alt="American Airlines"
      className="size-10 shrink-0 2xl:size-12"
    />
  );
}

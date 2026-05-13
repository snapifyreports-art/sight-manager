/**
 * Open snags card on the Daily Brief.
 *
 * (May 2026 sprint 7a) Extracted from DailySiteBrief.tsx.
 *
 * Behaviour preserved:
 *   - Collapsible header keyed against the `snags` openSection key
 *   - Top-20 truncation banner when openSnagsTruncated is true
 *   - Per-snag pending spinner via isSnagPending
 *   - Action button switches between Start (when status=OPEN) and
 *     Resolve (when status=IN_PROGRESS). The Resolve flow opens the
 *     SnagResolveDialog owned by the parent — we just invoke
 *     onSnagResolveOpen(snag).
 *   - Priority badge colour maps:
 *       CRITICAL → red, HIGH → orange, MEDIUM → yellow, else slate
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Bug,
  ChevronDown,
  Loader2,
  MapPin,
  Play,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BriefData, OpenSnag } from "./types";

export interface SnagsSectionProps {
  data: BriefData;
  siteId: string;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  isSnagPending: (id: string) => boolean;
  onSnagAction: (id: string, next: "IN_PROGRESS") => void;
  onSnagResolveOpen: (snag: OpenSnag) => void;
}

export function SnagsSection({
  data,
  siteId,
  openSections,
  toggleSection,
  isSnagPending,
  onSnagAction,
  onSnagResolveOpen,
}: SnagsSectionProps) {
  if (data.openSnagsList.length === 0) return null;

  return (
    <Card id="section-snags">
      <CardHeader
        className="cursor-pointer select-none pb-2"
        onClick={() => toggleSection("snags")}
      >
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bug className="size-4 text-orange-600" />
          Open Snags ({data.summary.openSnagCount})
          {data.openSnagsTruncated && (
            <span className="text-[10px] font-normal text-muted-foreground">
              Showing top 20 of {data.summary.openSnagCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 transition-transform duration-200",
              openSections.has("snags") && "rotate-180",
            )}
          />
        </CardTitle>
      </CardHeader>
      {openSections.has("snags") && (
        <CardContent>
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {data.openSnagsTruncated && (
              <p className="mb-2 text-xs text-muted-foreground">
                Showing 20 of {data.summary.openSnagCount} open snags.{" "}
                <Link
                  href={`/sites/${siteId}?tab=snags`}
                  className="text-blue-600 hover:underline"
                >
                  View all in Snags tab →
                </Link>
              </p>
            )}
            {data.openSnagsList.map((snag) => {
              const isPendingSnag = isSnagPending(snag.id);
              return (
                <div
                  key={snag.id}
                  className={`rounded border p-2 text-sm ${
                    snag.priority === "CRITICAL"
                      ? "border-red-200 bg-red-50"
                      : snag.priority === "HIGH"
                        ? "border-orange-200 bg-orange-50/60"
                        : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/sites/${siteId}?tab=snags&snagId=${snag.id}`}
                        className="font-medium leading-snug text-blue-600 hover:underline"
                      >
                        {snag.description}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <Link
                          href={`/sites/${siteId}?tab=snags&snagId=${snag.id}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {snag.plot.plotNumber
                            ? `Plot ${snag.plot.plotNumber}`
                            : snag.plot.name}
                        </Link>
                        {snag.location && (
                          <span>
                            {" "}
                            · <MapPin className="inline size-3" />{" "}
                            {snag.location}
                          </span>
                        )}
                        {snag.assignedTo && (
                          <span> · {snag.assignedTo.name}</span>
                        )}
                        {snag.contact && (
                          <span>
                            {" "}
                            · {snag.contact.company || snag.contact.name}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          snag.priority === "CRITICAL"
                            ? "border-red-300 text-red-700"
                            : snag.priority === "HIGH"
                              ? "border-orange-300 text-orange-700"
                              : snag.priority === "MEDIUM"
                                ? "border-yellow-300 text-yellow-700"
                                : "border-slate-200 text-slate-600"
                        }`}
                      >
                        {snag.priority}
                      </Badge>
                      {isPendingSnag ? (
                        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                      ) : snag.status === "OPEN" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 border-blue-200 px-2 text-xs text-blue-700 hover:bg-blue-50"
                          onClick={() => onSnagAction(snag.id, "IN_PROGRESS")}
                        >
                          <Play className="mr-1 size-2.5" />
                          Start
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 border-green-200 px-2 text-xs text-green-700 hover:bg-green-50"
                          onClick={() => onSnagResolveOpen(snag)}
                        >
                          <CheckCircle2 className="mr-1 size-2.5" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

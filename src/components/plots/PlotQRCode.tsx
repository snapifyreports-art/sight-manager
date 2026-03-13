"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { Download, Printer, QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface PlotQRCodeProps {
  plotId: string;
  plotNumber: string | null;
  plotName: string;
  siteName: string;
}

export function PlotQRCode({
  plotId,
  plotNumber,
  plotName,
  siteName,
}: PlotQRCodeProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const plotUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/sites/${plotId.split("/")[0]}/plots/${plotId}`
      : "";

  useEffect(() => {
    if (!plotId) return;
    // Build plot URL — use the current origin
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/plots/${plotId}`
        : `https://app.sightmanager.com/plots/${plotId}`;

    QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [plotId]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.download = `QR-Plot-${plotNumber || plotName}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handlePrint = () => {
    if (!qrDataUrl) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head><title>QR Code - Plot ${plotNumber || plotName}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;margin:0;">
          <h2 style="margin-bottom:4px;">${siteName}</h2>
          <h3 style="margin-top:0;color:#666;">Plot ${plotNumber || plotName}</h3>
          <img src="${qrDataUrl}" style="width:300px;height:300px;" />
          <p style="color:#999;font-size:12px;margin-top:8px;">Scan to open plot details</p>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <QrCode className="size-4" />
          QR Code
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-3">
          {qrDataUrl ? (
            <>
              <img
                src={qrDataUrl}
                alt={`QR Code for Plot ${plotNumber || plotName}`}
                className="size-40 rounded border"
              />
              <p className="text-xs text-muted-foreground">
                Scan to open plot details
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="mr-1 size-3.5" />
                  Download
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="mr-1 size-3.5" />
                  Print
                </Button>
              </div>
            </>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Batch QR generator for all plots on a site
interface BatchQRProps {
  siteId: string;
  siteName: string;
  plots: Array<{
    id: string;
    plotNumber: string | null;
    name: string;
    houseType: string | null;
  }>;
}

export function BatchPlotQR({ siteId, siteName, plots }: BatchQRProps) {
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  const generateAll = async () => {
    setGenerating(true);
    const codes: Record<string, string> = {};
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://app.sightmanager.com";

    for (const plot of plots) {
      try {
        const url = `${origin}/sites/${siteId}/plots/${plot.id}`;
        codes[plot.id] = await QRCode.toDataURL(url, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: "M",
        });
      } catch (e) {
        console.error(`QR error for plot ${plot.id}:`, e);
      }
    }

    setQrCodes(codes);
    setGenerating(false);
  };

  const printAll = () => {
    const win = window.open("", "_blank");
    if (!win) return;

    const plotsHtml = plots
      .map(
        (plot) => `
        <div style="display:inline-flex;flex-direction:column;align-items:center;padding:16px;border:1px solid #eee;margin:8px;border-radius:8px;width:220px;">
          ${qrCodes[plot.id] ? `<img src="${qrCodes[plot.id]}" style="width:160px;height:160px;" />` : ""}
          <p style="font-weight:bold;margin:8px 0 0;">Plot ${plot.plotNumber || plot.name}</p>
          ${plot.houseType ? `<p style="color:#666;font-size:12px;margin:2px 0;">${plot.houseType}</p>` : ""}
        </div>
      `
      )
      .join("");

    win.document.write(`
      <html>
        <head><title>QR Codes - ${siteName}</title></head>
        <body style="font-family:sans-serif;padding:20px;">
          <h2>${siteName} — Plot QR Codes</h2>
          <div style="display:flex;flex-wrap:wrap;">${plotsHtml}</div>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <QrCode className="size-4" />
            Plot QR Codes ({plots.length})
          </span>
          <div className="flex gap-2">
            {Object.keys(qrCodes).length === 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={generateAll}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <QrCode className="mr-1 size-3.5" />
                )}
                Generate All
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={printAll}>
                <Printer className="mr-1 size-3.5" />
                Print All
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      {Object.keys(qrCodes).length > 0 && (
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {plots.map((plot) => (
              <div
                key={plot.id}
                className="flex flex-col items-center rounded-lg border p-2"
              >
                {qrCodes[plot.id] && (
                  <img
                    src={qrCodes[plot.id]}
                    alt={`QR Plot ${plot.plotNumber || plot.name}`}
                    className="size-20"
                  />
                )}
                <p className="mt-1 text-center text-xs font-medium">
                  {plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name}
                </p>
                {plot.houseType && (
                  <p className="text-[10px] text-muted-foreground">
                    {plot.houseType}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import "./export.css";
import { ApiError } from "../../shared/api/client";
import { exportApi, exportKeys, saveBlob, sharePageUrl, type ExportFormat } from "./api";

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "png", label: "Image (PNG)" },
  { format: "pdf", label: "Print (PDF)" },
  { format: "geojson", label: "Data (GeoJSON)" },
];

const message = (error: unknown) =>
  error instanceof ApiError
    ? error.userMessage
    : error instanceof Error
      ? error.message
      : "Something went wrong.";

/**
 * Download the saved plan as PNG / PDF / GeoJSON and manage its read-only share link.
 * Self-contained: needs only the plan id.
 */
export function ExportMenu({ planId, unsaved = false }: { planId: string; unsaved?: boolean }) {
  const queryClient = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const download = useMutation({
    mutationFn: async (format: ExportFormat) => {
      const { blob, filename } = await exportApi.download(planId, format);
      saveBlob(blob, filename ?? `plan.${format}`);
    },
  });
  const status = useQuery({
    queryKey: exportKeys.share(planId),
    queryFn: () => exportApi.shareStatus(planId),
  });
  const create = useMutation({
    mutationFn: () => exportApi.createShare(planId),
    onSuccess: (created) => {
      setLink(sharePageUrl(created.token));
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: exportKeys.share(planId) });
    },
  });
  const revoke = useMutation({
    mutationFn: () => exportApi.revokeShare(planId),
    onSuccess: () => {
      setLink(null);
      void queryClient.invalidateQueries({ queryKey: exportKeys.share(planId) });
    },
  });
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false); // the link is selectable in the field as a fallback
    }
  };
  const error = download.error ?? status.error ?? create.error ?? revoke.error;

  return (
    <details className="export-menu">
      <summary className="btn">Export &amp; share</summary>
      <div className="export-menu__panel" role="group" aria-label="Export and share">
        <h2>Download</h2>
        {unsaved && <p className="muted">Unsaved changes are not included. Save first.</p>}
        <div className="export-menu__row">
          {FORMATS.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              className="btn"
              disabled={download.isPending}
              onClick={() => download.mutate(format)}
            >
              {download.isPending && download.variables === format ? "Preparing…" : label}
            </button>
          ))}
        </div>
        <h2>Share read-only</h2>
        <p className="muted">
          Anyone with the link can view and download this plan, but not change it.
        </p>
        {link && (
          <div className="export-menu__row">
            <input
              readOnly
              aria-label="Share link"
              value={link}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button type="button" className="btn" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {link && <p className="muted">Copy it now: it cannot be shown again.</p>}
        <div className="export-menu__row">
          <button
            type="button"
            className="btn"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {status.data?.shared ? "Create a new link" : "Create link"}
          </button>
          {status.data?.shared && (
            <button
              type="button"
              className="btn"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              Stop sharing
            </button>
          )}
        </div>
        {status.data?.shared && !link && (
          <p className="muted">A link is active. Creating a new one disables the old link.</p>
        )}
        {error && <p role="alert">{message(error)}</p>}
      </div>
    </details>
  );
}

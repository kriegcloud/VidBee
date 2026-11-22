import { useAtomValue } from "@effect/atom-react";
import * as A from "effect/Array";
import * as O from "effect/Option";
import * as Order from "effect/Order";
import * as P from "effect/Predicate";
import * as R from "effect/Record";
import * as Str from "effect/String";
import { createContext, useContext, useMemo } from "react";
import { formatBytes, formatDuration, isAudioFormat, isVideoFormat } from "../../src/Extension.pure.js";
import { errorAtom, infoAtom, loadingAtom } from "../../src/Popup.atoms.js";
import type { VideoFormat, VideoGroup } from "../../src/Extension.model.js";
import "./App.css";
export interface PopupCommands {
  readonly download: () => void;
  readonly openClientAndRetry: () => void;
  readonly retry: () => void;
}
export const PopupCommandsContext = createContext<PopupCommands>({
  download: () => {},
  openClientAndRetry: () => {},
  retry: () => {},
});
function App() {
  const info = useAtomValue(infoAtom);
  const error = useAtomValue(errorAtom);
  const loading = useAtomValue(loadingAtom);
  const commands = useContext(PopupCommandsContext);
  const handleOpenClient = commands.download;
  const handleOpenClientAndRetry = commands.openClientAndRetry;
  const handleRetry = commands.retry;
  const formats = useMemo(() => info?.formats ?? [], [info]);
  const groupedFormats = useMemo(() => {
    const video: VideoFormat[] = [];
    const audio: VideoFormat[] = [];
    const other: VideoFormat[] = [];

    for (const format of formats) {
      if (isVideoFormat(format)) {
        video.push(format);
      } else if (isAudioFormat(format)) {
        audio.push(format);
      } else {
        other.push(format);
      }
    }

    return { video, audio, other };
  }, [formats]);

  const groupedVideoFormats = useMemo(() => {
    const raw = groupedFormats.video;
    if (raw.length === 0) {
      return [];
    }

    const groups: Record<number, VideoFormat[]> = {};
    const noHeight: VideoFormat[] = [];

    for (const f of raw) {
      const h =
        f.height || (f.resolution === undefined ? undefined : O.getOrUndefined(Str.match(/x(\d+)/)(f.resolution))?.[1]);
      const heightVal = P.isTruthy(h) ? Number(h) : 0;

      if (heightVal > 0) {
        if (groups[heightVal] === undefined) {
          groups[heightVal] = [];
        }
        groups[heightVal].push(f);
      } else {
        noHeight.push(f);
      }
    }

    const sortedLabels = A.sort(A.map(R.keys(groups), Number), Order.flip(Order.Number));

    const result: VideoGroup[] = A.map(sortedLabels, (h) => ({
      label: `${h}p`,
      height: h,
      formats: A.sort(groups[h] ?? [], (a: VideoFormat, b: VideoFormat) => {
        const sa = a.filesize || a.filesize_approx || 0;
        const sb = b.filesize || b.filesize_approx || 0;
        return Order.Number(sb, sa);
      }),
    }));

    if (noHeight.length > 0) {
      result.push({
        label: "Other",
        height: 0,
        formats: noHeight,
      });
    }

    return result;
  }, [groupedFormats.video]);

  const isInvalidPageError = error === "Please open a valid video page first.";
  const isClientConnectionError = error !== null && Str.includes("Client connection failed")(error);
  const errorTitle = isInvalidPageError
    ? "Open a video page"
    : isClientConnectionError
      ? "Connect the VidBeep app"
      : "Something went wrong";
  const errorDescription = isInvalidPageError
    ? "Navigate to a supported video page, then try again."
    : isClientConnectionError
      ? "The extension needs the VidBeep desktop app to be running."
      : "Try again in a moment.";

  const renderStatus = () => {
    if (loading) {
      return (
        <span className="status-indicator">
          <div className="status-dot loading" /> Working
        </span>
      );
    }
    if (P.isTruthy(error)) {
      return (
        <span className="status-indicator">
          <div className="status-dot error" /> Error
        </span>
      );
    }
    if (info !== null) {
      return (
        <span className="status-indicator">
          <div className="status-dot ok" /> Ready
        </span>
      );
    }
    return (
      <span className="status-indicator">
        <div className="status-dot" /> Idle
      </span>
    );
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <img alt="" className="brand-icon" height={32} src="/icon/128.png" width={32} />
          <h1>VidBeep</h1>
        </div>
        {renderStatus()}
      </header>
      {loading && (
        <div className="loading-container">
          <div className="spinner" />
          <div className="loading-text">Analyzing video...</div>
        </div>
      )}

      {!loading && P.isTruthy(error) && (
        <div className="error-container">
          <div className="error-header">
            <h2 className="error-title">{errorTitle}</h2>
            <p className="error-description">{errorDescription}</p>
          </div>
          <div className="error-banner">{error}</div>
          {isClientConnectionError ? (
            <div className="action-grid">
              <div className="action-card">
                <p className="action-title">Client installed</p>
                <p className="action-text">Start VidBeep and keep it running, then we will retry automatically.</p>
                <button className="secondary-button" onClick={handleOpenClientAndRetry} type="button">
                  Open Client
                </button>
              </div>
              <div className="action-card">
                <p className="action-title">Need the app?</p>
                <p className="action-text">Download VidBeep once, install it, then come back here to try again.</p>
                <a className="secondary-button" href="https://vidbee.app" rel="noopener noreferrer" target="_blank">
                  Download VidBeep
                </a>
              </div>
            </div>
          ) : (
            <div className="action-card">
              <p className="action-title">Try again</p>
              <p className="action-text">
                {isInvalidPageError ? "Open a supported video page, then retry." : "Retry after a moment."}
              </p>
              <button className="secondary-button" onClick={handleRetry} type="button">
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {!(loading || P.isTruthy(error)) && info !== null && (
        <>
          <section className="video-info">
            <div className="video-details">
              <h2>{info.title || "Untitled video"}</h2>
              <div className="meta-row">
                <span>{formatDuration(info.duration)}</span>
                <span>•</span>
                <span>{formats.length} formats</span>
              </div>
            </div>
            {info.thumbnail && <img alt="" className="thumbnail" src={info.thumbnail} />}
          </section>

          <button className="primary-button" onClick={handleOpenClient} type="button">
            Download with VidBeep
          </button>

          <section className="formats-section">
            {A.map(groupedVideoFormats, (group) => (
              <div className="format-group" key={group.label}>
                <div className="group-title sticky-title">{group.label}</div>
                <table className="format-table">
                  <thead>
                    <tr>
                      <th className="col-id">ID</th>
                      <th className="col-ext">Ext</th>
                      <th className="col-size">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {A.map(group.formats, (f) => (
                      <tr key={`vg-${group.label}-${f.format_id ?? f.ext ?? "video"}`}>
                        <td className="col-id">{f.format_id || "-"}</td>
                        <td className="col-ext">{f.ext || "-"}</td>
                        <td className="col-size">{formatBytes(f.filesize || f.filesize_approx)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {groupedVideoFormats.length === 0 && groupedFormats.audio.length === 0 && (
              <div className="empty-state">No compatible formats.</div>
            )}

            {groupedFormats.audio.length > 0 && (
              <div className="format-group">
                <div className="group-title">Audio Only</div>
                <table className="format-table">
                  <thead>
                    <tr>
                      <th className="col-id">ID</th>
                      <th className="col-ext">Ext</th>
                      <th className="col-size">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {A.map(groupedFormats.audio, (f) => (
                      <tr key={`a-${f.format_id ?? f.ext ?? "audio"}`}>
                        <td className="col-id">{f.format_id || "-"}</td>
                        <td className="col-ext">{f.ext || "-"}</td>
                        <td className="col-size">{formatBytes(f.filesize || f.filesize_approx)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default App;

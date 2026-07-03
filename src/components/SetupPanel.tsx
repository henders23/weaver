import type {
  BubblePosition,
  BubbleSize,
  CaptureConfig,
  MediaDeviceOption,
} from "../types";

interface Props {
  config: CaptureConfig;
  setConfig: React.Dispatch<React.SetStateAction<CaptureConfig>>;
  cameras: MediaDeviceOption[];
  mics: MediaDeviceOption[];
  onStart: () => void;
  busy: boolean;
}

const POSITIONS: { value: BubblePosition; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

const SIZES: { value: BubbleSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export function SetupPanel({
  config,
  setConfig,
  cameras,
  mics,
  onStart,
  busy,
}: Props) {
  const update = (patch: Partial<CaptureConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-white">Set up your recording</h2>
        <p className="text-sm text-white/60">
          Choose your camera and audio, arrange the webcam bubble, then start.
          You'll pick the screen or window to share next.
        </p>
      </div>

      <Field label="Camera">
        <Select
          value={config.cameraDeviceId ?? ""}
          onChange={(v) => update({ cameraDeviceId: v || null })}
          options={cameras}
          placeholder="Default camera"
        />
      </Field>

      <Toggle
        label="Record microphone"
        checked={config.micEnabled}
        onChange={(v) => update({ micEnabled: v })}
      />

      {config.micEnabled && (
        <Field label="Microphone">
          <Select
            value={config.micDeviceId ?? ""}
            onChange={(v) => update({ micDeviceId: v || null })}
            options={mics}
            placeholder="Default microphone"
          />
        </Field>
      )}

      <Toggle
        label="Capture system / tab audio"
        checked={config.systemAudio}
        onChange={(v) => update({ systemAudio: v })}
        hint="Tick “Share system audio” in the screen-share dialog too."
      />

      <Field label="Bubble position">
        <div className="grid grid-cols-2 gap-2">
          {POSITIONS.map((p) => (
            <Chip
              key={p.value}
              active={config.bubblePosition === p.value}
              onClick={() => update({ bubblePosition: p.value })}
            >
              {p.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Bubble size">
        <div className="grid grid-cols-3 gap-2">
          {SIZES.map((s) => (
            <Chip
              key={s.value}
              active={config.bubbleSize === s.value}
              onClick={() => update({ bubbleSize: s.value })}
            >
              {s.label}
            </Chip>
          ))}
        </div>
      </Field>

      <button
        onClick={onStart}
        disabled={busy}
        className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Starting…" : "Choose screen & set up"}
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white/80">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: MediaDeviceOption[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.deviceId} value={o.deviceId}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-sm font-medium text-white/80">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={
            "relative h-6 w-11 rounded-full transition " +
            (checked ? "bg-brand" : "bg-white/15")
          }
        >
          <span
            className={
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition " +
              (checked ? "left-[1.375rem]" : "left-0.5")
            }
          />
        </button>
      </label>
      {hint && <p className="text-xs text-white/40">{hint}</p>}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-lg border px-3 py-2 text-sm transition " +
        (active
          ? "border-brand bg-brand/20 text-white"
          : "border-white/10 bg-white/5 text-white/70 hover:border-white/30")
      }
    >
      {children}
    </button>
  );
}

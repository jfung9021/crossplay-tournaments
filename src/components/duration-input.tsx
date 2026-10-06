"use client";

import { useCallback, useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { durationValidationMessage, formatDuration, parseDuration } from "@/domain/duration";
import type { DurationConstraints } from "@/domain/duration";

export interface DurationInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max">, DurationConstraints {
  value: string;
  onChange: (value: string) => void;
}

export function DurationInput({ id, value, onChange, required = false, minSeconds, maxSeconds, disabled, onBlur, onInvalid, "aria-describedby": describedBy, "aria-invalid": ariaInvalid, ...props }: DurationInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [showError, setShowError] = useState(false);
  const message = disabled ? null : durationValidationMessage(value, { required, minSeconds, maxSeconds });
  const error = showError ? message : null;
  const setInputValidity = useCallback((input: HTMLInputElement | null) => { input?.setCustomValidity(message ?? ""); }, [message]);

  return <>
    <input {...props} ref={setInputValidity} id={inputId} type="text" inputMode="text" autoComplete="off" spellCheck={false} value={value} required={required} disabled={disabled}
      aria-describedby={[describedBy, `${inputId}-hint`, error ? `${inputId}-error` : null].filter(Boolean).join(" ")}
      aria-invalid={error ? true : ariaInvalid}
      onChange={event => {
        event.currentTarget.setCustomValidity(durationValidationMessage(event.currentTarget.value, { required, minSeconds, maxSeconds }) ?? "");
        onChange(event.currentTarget.value);
      }}
      onBlur={event => {
        setShowError(true);
        const seconds = parseDuration(event.currentTarget.value);
        if (seconds !== null && !durationValidationMessage(event.currentTarget.value, { required, minSeconds, maxSeconds }) && formatDuration(seconds) !== event.currentTarget.value) onChange(formatDuration(seconds));
        onBlur?.(event);
      }}
      onInvalid={event => { setShowError(true); onInvalid?.(event); }} />
    <span id={`${inputId}-hint`} className="form-note" style={{ display: "block" }}>m:ss</span>
    {error && <span id={`${inputId}-error`} role="alert" className="form-note" style={{ display: "block", color: "var(--danger)" }}>{error}</span>}
  </>;
}

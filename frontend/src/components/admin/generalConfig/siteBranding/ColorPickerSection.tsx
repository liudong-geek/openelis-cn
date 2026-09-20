/**
 * Color Picker Section Component
 *
 * Handles color selection with color picker and text input.
 * Accepts any valid CSS color format (hex, named colors, rgb(), hsl(), etc.)
 *
 * Task Reference: T051
 */

import React, { useState, useEffect } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { TextInput, InlineNotification } from "@carbon/react";
import { useIntl } from "react-intl";

interface ColorPickerSectionProps {
  label: string;
  description?: ReactNode;
  value?: string;
  onChange?: (color: string) => void;
  helperText?: ReactNode;
}

function ColorPickerSection({
  label,
  description,
  value,
  onChange,
  helperText,
}: ColorPickerSectionProps) {
  const intl = useIntl();
  const [colorValue, setColorValue] = useState(value || "#0f62fe");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setColorValue(value || "#0f62fe");
  }, [value]);

  const handleColorPickerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newColor = event.target.value;
    setColorValue(newColor);
    setError(null);
    if (onChange) {
      onChange(newColor);
    }
  };

  const handleColorInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    // Accept any CSS color format - validation happens via the preview square.
    // Named colors (e.g., "rebeccapurple"), rgb(), hsl(), etc. are all valid.
    const newColor = event.target.value;
    setColorValue(newColor);
    setError(null);
    if (onChange && newColor) {
      onChange(newColor);
    }
  };

  return (
    <article className="branding-color-card">
      <header>
        <span
          className="branding-color-card__swatch"
          data-testid="color-preview"
          style={{ backgroundColor: colorValue }}
          aria-label={intl.formatMessage(
            { id: "site.branding.color.preview" },
            { color: colorValue },
          )}
        />
        <div>
          <h3>{label}</h3>
          {description && <p>{description}</p>}
        </div>
      </header>

      {error && (
        <InlineNotification
          kind="error"
          title={intl.formatMessage({ id: "error.title" })}
          subtitle={error}
          onClose={() => setError(null)}
        />
      )}

      <div className="branding-color-card__controls">
        <input
          className="branding-color-card__picker"
          type="color"
          value={colorValue}
          onChange={handleColorPickerChange}
          aria-label={label}
        />
        <TextInput
          id={`${label.toLowerCase().replace(/\s+/g, "-")}-color`}
          labelText={intl.formatMessage({
            id: "site.branding.color.hex.label",
          })}
          value={colorValue}
          onChange={handleColorInputChange}
          placeholder={intl.formatMessage({
            id: "site.branding.colorPicker.placeholder",
          })}
          invalid={!!error}
          invalidText={error || undefined}
          helperText={
            helperText ||
            intl.formatMessage({
              id: "site.branding.colorPicker.helperText",
            })
          }
        />
      </div>
    </article>
  );
}

export default ColorPickerSection;

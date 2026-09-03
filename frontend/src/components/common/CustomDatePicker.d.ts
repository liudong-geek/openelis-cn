import type { ComponentType, ReactNode } from "react";

export interface CustomDatePickerProps {
  id: string;
  labelText?: ReactNode;
  value?: string;
  onChange: (value: string) => void;
  name?: string;
  className?: string;
  invalid?: boolean | string;
  invalidText?: ReactNode;
  disabled?: boolean;
  autofillDate?: boolean;
  updateStateValue?: boolean;
  disallowFutureDate?: boolean;
  disallowPastDate?: boolean;
}

declare const CustomDatePicker: ComponentType<CustomDatePickerProps>;

export default CustomDatePicker;

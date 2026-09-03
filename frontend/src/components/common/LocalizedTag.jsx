import React from "react";
import { DismissibleTag, Tag as CarbonTag } from "@carbon/react";
import { useIntl } from "react-intl";

/**
 * Carbon removed the dismissible behaviour from the base Tag API. This
 * compatibility component keeps existing read-only tags unchanged while
 * giving removable tags a localized, accessible dismiss action.
 */
const LocalizedTag = ({
  children,
  filter,
  onClose,
  text,
  title,
  dismissTooltipLabel,
  ...rest
}) => {
  const intl = useIntl();

  if (filter || onClose) {
    const removeLabel = intl.formatMessage({ id: "label.button.remove" });
    return (
      <DismissibleTag
        {...rest}
        onClose={onClose}
        text={text ?? children}
        title={title ?? removeLabel}
        dismissTooltipLabel={dismissTooltipLabel ?? removeLabel}
      />
    );
  }

  return (
    <CarbonTag {...rest} title={title}>
      {text ?? children}
    </CarbonTag>
  );
};

export default LocalizedTag;

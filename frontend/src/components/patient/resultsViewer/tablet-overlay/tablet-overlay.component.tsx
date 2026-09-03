import React from "react";
import { Button, Header } from "@carbon/react";
import { ArrowLeft } from "@carbon/react/icons";
import { useIntl } from "react-intl";
//import styles from './tablet-overlay.scss';
import "./tablet-overlay.scss";

interface OverlayProps {
  children?: React.ReactNode;
  close: () => void;
  headerText: string | React.ReactElement;
  buttonsGroup?: React.ReactElement;
}

const Overlay: React.FC<OverlayProps> = ({
  close,
  children,
  headerText,
  buttonsGroup,
}) => {
  const intl = useIntl();

  return (
    <div className="tabletOverlay">
      <Header className="tabletOverlayHeader">
        <Button
          onClick={close}
          hasIconOnly
          iconDescription={intl.formatMessage({
            id: "patient.resultsViewer.tree.back",
          })}
        >
          <ArrowLeft size={16} onClick={close} />
        </Button>
        <div className="headerContent">{headerText}</div>
      </Header>
      <div className="overlayContent">{children}</div>
      <div className="buttonsGroup">{buttonsGroup}</div>
    </div>
  );
};

export default Overlay;

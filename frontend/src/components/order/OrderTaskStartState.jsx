import React from "react";
import { Button } from "@carbon/react";
import { Add, ArrowLeft } from "@carbon/icons-react";
import { FormattedMessage } from "react-intl";
import { useHistory } from "react-router-dom";

/**
 * Empty state for collection, labelling and acceptance when a task is opened
 * directly from the main navigation. The scanner remains available in the
 * shared workflow header, so the operator can select an order without being
 * silently redirected to another page.
 */
const OrderTaskStartState = ({ taskLabel }) => {
  const history = useHistory();

  return (
    <section className="order-task-start-state" role="status">
      <div className="order-task-start-state__copy">
        <h3>
          <FormattedMessage id="order.taskEntry.title" />
        </h3>
        <p>
          <FormattedMessage
            id="order.taskEntry.description"
            values={{ task: <FormattedMessage id={taskLabel} /> }}
          />
        </p>
      </div>
      <div className="order-task-start-state__actions">
        <Button
          kind="secondary"
          size="md"
          renderIcon={ArrowLeft}
          onClick={() => history.push("/order")}
        >
          <FormattedMessage id="sidenav.label.order.active" />
        </Button>
        <Button
          kind="primary"
          size="md"
          renderIcon={Add}
          onClick={() => history.push("/order/enter")}
        >
          <FormattedMessage id="order.start.new" />
        </Button>
      </div>
    </section>
  );
};

export default OrderTaskStartState;

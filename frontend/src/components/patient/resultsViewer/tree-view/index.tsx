import React from "react";
import { useIntl } from "react-intl";
import { EmptyState, ErrorState } from "../commons";
import { FilterProvider } from "../filter/filter-context";
import TreeView from "./tree-view.component";

interface TreeViewWrapperProps {
  patientUuid: string;
  basePath: string;
  testUuid: string;
  expanded: boolean;
  type: string;
  roots: unknown[];
  loading: boolean;
  error?: unknown;
}

const TreeViewWrapper: React.FC<TreeViewWrapperProps> = (props) => {
  const { roots, loading, error } = props;
  const intl = useIntl();

  if (error)
    return (
      <ErrorState
        error={error}
        headerTitle={intl.formatMessage({
          id: "patient.resultsViewer.error.title",
        })}
      />
    );

  if (roots?.length) {
    return (
      <FilterProvider key={props.patientUuid} roots={roots}>
        <TreeView {...props} loading={loading} />
      </FilterProvider>
    );
  }

  return (
    <EmptyState
      headerTitle={intl.formatMessage({
        id: "patient.resultsViewer.results.title",
      })}
      displayText={intl.formatMessage({
        id: "patient.resultsViewer.results.data",
      })}
    />
  );
};

export default TreeViewWrapper;

import React, { useContext, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import {
  TreeView,
  TreeNode as CarbonTreeNode,
  Checkbox,
  Search,
} from "@carbon/react";
import type { FilterNodeProps, FilterLeafProps } from "./filter-types";
import FilterContext from "./filter-context";
import "./filter-set.styles.scss";

const isIndeterminate = (
  kids: string[] | undefined,
  checkboxes: Record<string, boolean>,
) => {
  return (
    !!kids &&
    kids.length > 0 &&
    !kids.every((kid) => checkboxes[kid]) &&
    !kids.every((kid) => !checkboxes[kid])
  );
};

interface FilterSetProps {
  hideFilterSetHeader?: boolean;
}

export interface FilterTreeNode {
  display?: string;
  flatName?: string;
  subSets?: FilterTreeNode[];
  [key: string]: unknown;
}

export const filterTreeNodes = <T extends FilterTreeNode>(
  roots: T[],
  searchTerm: string,
): T[] => {
  const normalizedTerm = searchTerm.trim().toLocaleLowerCase();
  if (!normalizedTerm) return roots;

  const filterNode = (node: T): T | null => {
    const ownMatch = String(node.display || "")
      .toLocaleLowerCase()
      .includes(normalizedTerm);

    if (ownMatch) return node;

    const matchingChildren = (node.subSets || [])
      .map((child) => filterNode(child as T))
      .filter((child): child is T => child !== null);

    return matchingChildren.length
      ? ({ ...node, subSets: matchingChildren } as T)
      : null;
  };

  return roots.map(filterNode).filter((node): node is T => node !== null);
};

const FilterSet: React.FC<FilterSetProps> = ({
  hideFilterSetHeader = false,
}) => {
  const { roots } = useContext(FilterContext);
  const intl = useIntl();
  const [searchTerm, setSearchTerm] = useState("");
  const filteredRoots = useMemo(
    () => filterTreeNodes(roots || [], searchTerm),
    [roots, searchTerm],
  );

  return (
    <div className="stickyFilterSet">
      {!hideFilterSetHeader && (
        <h4 className="filterTreeLabel">
          {intl.formatMessage({
            id: "patient.resultsViewer.filter.heading",
          })}
        </h4>
      )}
      <div className="filterTreeSearchHeader">
        <Search
          size="sm"
          value={searchTerm}
          onChange={(evt) => setSearchTerm(evt.target.value)}
          labelText={intl.formatMessage({
            id: "patient.resultsViewer.filter.searchLabel",
          })}
          placeholder={intl.formatMessage({
            id: "patient.resultsViewer.filter.searchPlaceholder",
          })}
        />
      </div>
      <div className="filterSetContent">
        {filteredRoots.length ? (
          <TreeView
            label={intl.formatMessage({
              id: "patient.resultsViewer.filter.categories",
            })}
            hideLabel
            size="sm"
          >
            {filteredRoots.map((root, index) => (
              <FilterNode root={root} level={0} key={`root-${index}`} />
            ))}
          </TreeView>
        ) : (
          <p role="status">
            {intl.formatMessage({
              id: "patient.resultsViewer.filter.noMatches",
              defaultMessage: "No test categories match this search.",
            })}
          </p>
        )}
      </div>
    </div>
  );
};

const FilterNode: React.FC<FilterNodeProps> = ({ root, level }) => {
  const { checkboxes, parents, updateParent } = useContext(FilterContext);
  // Level 0 starts expanded; deeper levels start collapsed. Mirrors the
  // previous AccordionItem `open={true}` on root-only behavior.
  const [expanded, setExpanded] = useState(level === 0);

  const childFlatNames = parents?.[root.flatName] || [];
  const allChildrenChecked =
    childFlatNames.length > 0 && childFlatNames.every((kid) => checkboxes[kid]);
  const indeterminate = isIndeterminate(childFlatNames, checkboxes);
  const hasLeafChildren = root?.subSets?.[0]?.obs !== undefined;

  const labelNode = (
    <Checkbox
      id={`tree-cb-${root.flatName}`}
      labelText={`${root?.display} (${childFlatNames.length})`}
      checked={!!root.hasData && allChildrenChecked}
      indeterminate={indeterminate}
      onChange={() => updateParent(root.flatName)}
      // Stop bubbling so TreeNode's row-click selection doesn't fight
      // with the checkbox's own toggle behavior.
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      disabled={!root.hasData}
    />
  );

  // onToggle signature differs between TreeView's controlled and
  // uncontrolled modes — accept both shapes safely.
  const handleToggle = (arg1: unknown, arg2?: { isExpanded?: boolean }) => {
    if (typeof arg1 === "boolean") setExpanded(arg1);
    else if (arg2 && typeof arg2.isExpanded === "boolean")
      setExpanded(arg2.isExpanded);
    else setExpanded((prev) => !prev);
  };

  return (
    <CarbonTreeNode
      id={`tree-${root.flatName}`}
      label={labelNode}
      isExpanded={expanded}
      onToggle={handleToggle as never}
    >
      {!hasLeafChildren &&
        root?.subSets?.map((sub, i) => (
          <FilterNode root={sub} level={level + 1} key={i} />
        ))}
      {hasLeafChildren &&
        root?.subSets?.map((leaf: any, i: number) => (
          <FilterLeaf leaf={leaf} key={i} />
        ))}
    </CarbonTreeNode>
  );
};

const FilterLeaf: React.FC<FilterLeafProps> = ({ leaf }) => {
  const { checkboxes, toggleVal } = useContext(FilterContext);

  const labelNode = (
    <Checkbox
      id={`tree-cb-${leaf?.flatName}`}
      labelText={leaf?.display}
      checked={!!checkboxes?.[leaf.flatName]}
      onChange={() => toggleVal(leaf.flatName)}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      disabled={!leaf.hasData}
    />
  );

  return <CarbonTreeNode id={`tree-${leaf?.flatName}`} label={labelNode} />;
};

export default FilterSet;

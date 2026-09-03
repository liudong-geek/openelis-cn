import { assessValue, exist } from "../loadPatientTestData/helpers";
import { showNotification } from "../commons";
import { TreeNode } from "../filter/filter-types";
import { getFromOpenElisServer } from "../../../utils/Utils";
import { useMemo, useState, useEffect } from "react";

function computeTrendlineData(treeNode: TreeNode): Array<TreeNode> {
  const tests: Array<TreeNode> = [];
  if (!treeNode) {
    return tests;
  }
  treeNode?.subSets?.forEach((subNode) => {
    if ((subNode as TreeNode)?.obs) {
      const TreeNode = subNode as TreeNode;
      const observations = TreeNode.obs || [];
      tests.push({
        ...TreeNode,
        range: exist(TreeNode.hiNormal, TreeNode.lowNormal)
          ? `${TreeNode.lowNormal} - ${TreeNode.hiNormal}`
          : "",
        obs: observations.map((ob) => ({
          ...ob,
          interpretation:
            (typeof ob.interpretation === "string" && ob.interpretation.trim()
              ? ob.interpretation
              : null) ||
            assessValue({ ...TreeNode, ...ob })(ob.rawValue ?? ob.value),
        })),
      });
    } else if (subNode?.subSets) {
      const subTreesTests = computeTrendlineData(subNode as TreeNode); // recursion
      tests.push(...subTreesTests);
    }
  });
  return tests;
}

export function useObstreeData(
  patientUuid: string,
  conceptUuid: string,
): {
  isLoading: boolean;
  trendlineData: TreeNode;
  isValidating: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<TreeNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const fetchResults = (results: TreeNode | undefined) => {
    if (results === undefined) {
      setData(null);
      setError(new Error("Patient result trend request failed"));
      setIsLoading(false);
      return;
    }

    setData(results);
    setError(null);
    setIsLoading(false);
  };

  useEffect(() => {
    setData(null);
    setError(null);

    if (!patientUuid || !conceptUuid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    getFromOpenElisServer(
      `/rest/test-result-tree?patientId=${patientUuid}&testId=${conceptUuid}`,
      fetchResults,
      controller.signal,
    );

    return () => controller.abort();
  }, [patientUuid, conceptUuid]);

  if (error) {
    showNotification({
      title: error.name,
      description: error.message,
      kind: "error",
    });
  }

  const returnValue = useMemo(
    () => ({
      isLoading,
      trendlineData:
        (data ? computeTrendlineData(data)?.[0] : undefined) ??
        ({
          obs: [],
          display: "",
          hiNormal: 0,
          lowNormal: 0,
          units: "",
          range: "",
        } as TreeNode),
      isValidating,
      error,
    }),
    [data, error, isLoading, isValidating],
  );

  return returnValue;
}

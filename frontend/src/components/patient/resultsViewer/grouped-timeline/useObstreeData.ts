import { useMemo, useState, useEffect } from "react";
import { assessValue, exist } from "../loadPatientTestData/helpers";
import { getFromOpenElisServer } from "../../../utils/Utils";
import type { TreeNode } from "../filter/filter-types";

export const getName = (prefix: string, name: string) => {
  return prefix ? `${prefix}-${name}` : name;
};

const augmentObstreeData = (node: TreeNode, prefix: string): TreeNode => {
  const outData = JSON.parse(JSON.stringify(node));
  outData.flatName = getName(prefix, node.display);
  outData.hasData = false;

  if (outData?.subSets?.length) {
    outData.subSets = outData.subSets.map((subNode: TreeNode) =>
      augmentObstreeData(subNode, getName(prefix, node?.display)),
    );
    outData.hasData = outData.subSets.some(
      (subNode: TreeNode) => subNode.hasData,
    );
  }
  if (exist(outData?.hiNormal, outData?.lowNormal)) {
    outData.range = `${outData.lowNormal} – ${outData.hiNormal}`;
  }
  if (outData?.obs?.length) {
    outData.obs = outData.obs.map((ob) => {
      const explicitInterpretation =
        typeof ob.interpretation === "string" && ob.interpretation.trim()
          ? ob.interpretation
          : null;
      const assess = assessValue({ ...outData, ...ob });
      const assessedInterpretation = assess(ob.rawValue ?? ob.value);
      return {
        ...ob,
        // The result endpoint is authoritative when it supplies a clinical
        // interpretation. Only infer from the observation's own reference
        // metadata when the server leaves the value unassessed.
        interpretation: explicitInterpretation || assessedInterpretation,
      };
    });
    outData.hasData = true;
  }

  return { ...outData };
};

const useGetManyObstreeData = (patientUuid?: string) => {
  const [data, setData] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchResultsTree = (resultsTree: TreeNode[] | undefined) => {
    if (resultsTree === undefined) {
      setData([]);
      setError(new Error("Patient result tree request failed"));
      setIsLoading(false);
      return;
    }

    setData(Array.isArray(resultsTree) ? resultsTree : []);
    setError(null);
    setIsLoading(false);
  };

  useEffect(() => {
    setData([]);
    setError(null);

    if (!patientUuid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const controller = new AbortController();
    getFromOpenElisServer(
      `/rest/result-tree?patientId=${patientUuid}`,
      fetchResultsTree,
      controller.signal,
    );

    return () => controller.abort();
  }, [patientUuid]);

  const result = useMemo(() => {
    return data.filter(Boolean).map((resp) => ({
      ...resp,
      loading: false,
      data: augmentObstreeData(resp, ""),
    }));
  }, [data]);
  const roots = result.map((item) => item.data);
  const loading = isLoading;
  return { roots, loading, error };
};

export default useGetManyObstreeData;
export { useGetManyObstreeData };

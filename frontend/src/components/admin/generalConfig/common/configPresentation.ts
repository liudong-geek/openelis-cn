// Display labels only: configuration keys and values remain server-owned.
const reportLabels: Record<
  string,
  { name: string; descriptions: Record<string, string> }
> = {
  "additional site info": {
    name: "报告页眉附加信息",
    descriptions: {
      "additional information for report header":
        "报告页眉中补充显示的机构信息。",
    },
  },
  headerLeftImage: {
    name: "报告页眉左侧标识",
    descriptions: {
      "image for the left side of report header":
        "报告页眉左侧显示的标识图片。",
    },
  },
  headerRightImage: {
    name: "报告页眉右侧标识",
    descriptions: {
      "image for the right side of report header":
        "报告页眉右侧显示的标识图片。",
    },
  },
  "lab director": {
    name: "检验科负责人姓名",
    descriptions: {
      "the lab directors name for the reports":
        "报告中显示的检验科负责人姓名。",
    },
  },
  labDirectorName: {
    name: "报告负责人署名",
    descriptions: { "image for lab director name": "报告中显示的负责人署名。" },
  },
  labDirectorTitle: {
    name: "报告负责人职称",
    descriptions: {
      "image for lab director title": "报告中显示的负责人职称。",
    },
  },
  labDirectorSignature: {
    name: "报告负责人签名图片",
    descriptions: {
      "image for lab director signature": "报告中显示的负责人签名图片。",
    },
  },
};

export const getConfigPresentation = (
  name: string,
  description: string,
  locale: string,
) => {
  const label = /^zh(?:-|$)/i.test(locale) ? reportLabels[name] : undefined;
  return {
    name: label?.name || name,
    description:
      label?.descriptions[description.trim().toLowerCase()] || description,
  };
};

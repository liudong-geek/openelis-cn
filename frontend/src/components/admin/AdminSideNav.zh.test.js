import enMessages from "../../languages/en.json";
import zhMessages from "../../languages/zh.json";
import zhCnMessages from "../../languages/zh_CN.json";
import { V1_SECTIONS } from "./testCatalog/sectionConfig";
import { SAMPLE_TYPE_SECTIONS } from "./sampleTypeManagement/sectionConfig";

const CHINESE_CATALOG_NAV_LABELS = {
  "sidenav.label.admin.backToMainMenu": "返回主菜单",
  "sidenav.label.admin.labelPresets": "标签预设",
  "sidenav.label.admin.Listplugin": "插件文件管理",
  "sidenav.label.admin.localization": "本地化管理",
  "sidenav.label.admin.testmgt.testCatalogEditor": "检验项目管理",
  "sidenav.label.admin.testCatalog": "检验项目目录",
  "sidenav.label.admin.testCatalog.backToList": "← 返回检验项目目录",
  "sidenav.label.admin.testCatalog.sectionsHelper":
    "请选择检验项目后编辑详细配置",
  "sidenav.label.admin.testCatalog.editingGeneric": "正在编辑检验项目",
  "sidenav.label.admin.sampleTypeManagement": "标本类型管理",
  "sidenav.label.admin.sampleType.backToList": "← 返回标本类型列表",
  "sidenav.label.admin.sampleType.editingGeneric": "正在编辑标本类型",
  "sidenav.label.admin.sampleType.addingNew": "正在新增标本类型",
  "dataexport.status.title": "FHIR 数据交换监控",
};

const CHINESE_TEST_SECTION_LABELS = {
  "basic-info": "基本信息",
  "sample-results": "结果项",
  methods: "检验方法",
  ranges: "参考区间",
  storage: "标本保存",
  panels: "组合项目",
  labels: "标签",
  terminology: "标准编码",
  reagents: "检验试剂",
  analyzers: "分析仪映射",
  alerts: "结果预警",
  "reflex-calc": "结果联动与计算",
  localization: "中文名称",
  "display-order": "项目显示顺序",
};

const CHINESE_SAMPLE_TYPE_SECTION_LABELS = {
  "basic-info": "基本信息",
  "associated-tests": "关联检验项目",
  "display-order": "显示顺序",
  disposal: "废弃处置",
  terminology: "标准编码",
};

const CHINESE_LOCALES = [
  ["zh", zhMessages],
  ["zh-CN", zhCnMessages],
];

describe.each(CHINESE_LOCALES)(
  "AdminSideNav Chinese resources (%s)",
  (_, messages) => {
    it("keeps the directly visible management labels in Chinese", () => {
      Object.entries(CHINESE_CATALOG_NAV_LABELS).forEach(([key, value]) => {
        expect(messages[key]).toBe(value);
      });
    });

    it("translates every routed Test Catalog section", () => {
      expect(Object.keys(CHINESE_TEST_SECTION_LABELS)).toEqual(V1_SECTIONS);
      V1_SECTIONS.forEach((section) => {
        expect(messages[`label.testCatalog.section.${section}`]).toBe(
          CHINESE_TEST_SECTION_LABELS[section],
        );
      });
    });

    it("translates every routed sample-type section", () => {
      expect(Object.keys(CHINESE_SAMPLE_TYPE_SECTION_LABELS)).toEqual(
        SAMPLE_TYPE_SECTIONS,
      );
      SAMPLE_TYPE_SECTIONS.forEach((section) => {
        expect(messages[`label.sampleType.section.${section}`]).toBe(
          CHINESE_SAMPLE_TYPE_SECTION_LABELS[section],
        );
      });
    });
  },
);

describe.each([["en", enMessages], ...CHINESE_LOCALES])(
  "AdminSideNav dynamic editing labels (%s)",
  (_, messages) => {
    it("preserves the test and sample-type name placeholders", () => {
      expect(messages["sidenav.label.admin.testCatalog.editing"]).toContain(
        "{name}",
      );
      expect(messages["sidenav.label.admin.sampleType.editing"]).toContain(
        "{name}",
      );
    });
  },
);

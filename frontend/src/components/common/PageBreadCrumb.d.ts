import type { FC } from "react";

export interface ProductBreadcrumb {
  label: string;
  link: string;
  isCurrentPage?: boolean;
}

export interface PageBreadCrumbProps {
  breadcrumbs: ProductBreadcrumb[];
}

declare const PageBreadCrumb: FC<PageBreadCrumbProps>;

export default PageBreadCrumb;

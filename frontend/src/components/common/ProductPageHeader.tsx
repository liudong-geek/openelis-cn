import React from "react";

interface ProductPageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  titleId?: string;
}

/**
 * Shared product-page heading used by high-frequency workflow pages.
 * It keeps the title, supporting context, and primary actions in a stable
 * location so users do not have to relearn the layout on every screen.
 */
const ProductPageHeader = ({
  title,
  subtitle,
  actions,
  titleId = "page-title",
}: ProductPageHeaderProps) => (
  <header className="oe-page-header" aria-labelledby={titleId}>
    <div className="oe-page-header__copy">
      <h1 id={titleId} className="oe-page-header__title">
        {title}
      </h1>
      {subtitle && <p className="oe-page-header__subtitle">{subtitle}</p>}
    </div>
    {actions && <div className="oe-page-header__actions">{actions}</div>}
  </header>
);

export default ProductPageHeader;
